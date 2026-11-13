import {uiIcon} from "./uiIcons.ts";
export type SoundtrackScene = "shop" | "dungeon" | "boss";

const PREFERENCE_KEY = "dungeon-shop-master-music-v1";
const FADE_DURATION_MS = 1100;
const TRACK_NAMES: Record<SoundtrackScene, string> = {
  shop: "The Lean Season",
  dungeon: "Beneath the Surface",
  boss: "Trial by Iron",
};

type Preferences = { enabled: boolean; volume: number };

function loadPreferences(): Preferences {
  const defaults = { enabled: true, volume: 0.35 };
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    const value = parsed as Partial<Preferences>;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
      volume: typeof value.volume === "number" && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(1, value.volume)) : defaults.volume,
    };
  } catch {
    return defaults; // Private browsing, disabled storage or corrupted preferences.
  }
}

/** Purely presentation-side audio. It never touches gameplay RNG, saves or ticks. */
export class SceneSoundtrack {
  private readonly tracks: Record<SoundtrackScene, HTMLAudioElement>;
  private readonly toggle: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly label: HTMLElement;
  private readonly status: HTMLElement;
  private scene: SoundtrackScene = "shop";
  private enabled: boolean;
  private volume: number;
  private started = false;
  private error: string | null = null;
  private transitionId = 0;
  private animationFrame: number | null = null;

  constructor() {
    const panel = document.querySelector<HTMLElement>("#music-panel")!;
    this.toggle = document.querySelector<HTMLButtonElement>("#music-toggle")!;
    this.slider = document.querySelector<HTMLInputElement>("#music-volume")!;
    this.label = document.querySelector<HTMLElement>("#music-track")!;
    this.status = document.querySelector<HTMLElement>("#music-status")!;
    const expand=panel.querySelector<HTMLButtonElement>("#music-expand")!;
    expand.append(uiIcon("speaker"));
    expand.addEventListener("click",()=>{
      const open=panel.dataset.expanded!=="true";
      panel.dataset.expanded=String(open);
      expand.setAttribute("aria-expanded",String(open));
      expand.setAttribute("aria-label",open?"Hide music controls":"Open music controls");
      expand.title=open?"Hide music controls":"Music controls";
    });
    // M also releases mouse control in spectator views. Unfold music first
    // so the existing keyboard-focus contract still reaches the mute button.
    window.addEventListener("keydown",event=>{
      if(event.code!=="KeyM"||event.repeat||document.querySelector("dialog[open]"))return;
      if(document.body.classList.contains("arena-active")||
        document.body.classList.contains("dungeon-active")){
        panel.dataset.expanded="true";
        expand.setAttribute("aria-expanded","true");
        expand.setAttribute("aria-label","Hide music controls");
        expand.title="Hide music controls";
        this.toggle.focus();
      }
    });
    const musicMark=panel.querySelector(".music-heading > span");
    musicMark?.replaceWith(uiIcon("speaker"));
    const preferences = loadPreferences();
    this.enabled = preferences.enabled;
    this.volume = preferences.volume;

    const makeTrack = (scene: SoundtrackScene, filename: string): HTMLAudioElement => {
      const audio = new Audio(import.meta.env.BASE_URL + "audio/" + filename);
      audio.id = "music-" + scene + "-audio";
      audio.loop = true;
      audio.preload = "none";
      audio.volume = 0;
      audio.hidden = true;
      audio.setAttribute("aria-hidden", "true");
      audio.addEventListener("error", () => {
        if (this.scene !== scene || !this.enabled) return;
        this.started = false;
        this.error = "Audio file unavailable";
        this.renderUi();
      });
      panel.append(audio);
      return audio;
    };
    this.tracks = {
      shop: makeTrack("shop", "the-lean-season.mp3"),
      dungeon: makeTrack("dungeon", "beneath-the-surface.mp3"),
      boss: makeTrack("boss", "trial-by-iron.mp3"),
    };

    this.toggle.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this.savePreferences();
      if (this.enabled) this.start();
      else {
        this.cancelFade();
        for (const audio of Object.values(this.tracks)) audio.pause();
      }
      this.renderUi();
    });
    this.slider.addEventListener("input", () => {
      this.volume = Math.max(0, Math.min(1, Number(this.slider.value) / 100));
      this.savePreferences();
      if (this.enabled && !this.started) this.start();
      else if (this.enabled && this.animationFrame === null)
        this.tracks[this.scene].volume = this.volume;
      this.renderUi();
    });

    // Browser autoplay policies require a genuine user gesture before .play().
    // Register in capture phase so arena/shop pointer lock cannot swallow it.
    const unlockFromGesture = (event: Event) => {
      if (event instanceof KeyboardEvent &&
          (event.repeat || ["Tab", "Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
      if (this.enabled && !this.started) this.start();
    };
    window.addEventListener("pointerdown", unlockFromGesture, true);
    window.addEventListener("keydown", unlockFromGesture, true);
    this.renderUi();
  }

  get soundEnabled():boolean { return this.enabled; }
  get soundVolume():number { return this.volume; }

  setScene(next: SoundtrackScene): void {
    if (this.scene === next) return;
    this.scene = next;
    if (this.enabled && this.started) this.fadeTo(next);
    this.renderUi();
  }

  private start(): void {
    if (!this.enabled) return;
    this.started = true;
    this.error = null;
    // Called synchronously inside the user event; never await before .play().
    this.fadeTo(this.scene);
    this.renderUi();
  }

  private cancelFade(): number {
    this.transitionId++;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    return this.transitionId;
  }

  private fadeTo(next: SoundtrackScene): void {
    const id = this.cancelFade();
    const incoming = this.tracks[next];
    const outgoing = Object.values(this.tracks).filter(track => track !== incoming);
    const fromIncoming = incoming.paused ? 0 : incoming.volume;
    const fromOutgoing = outgoing.map(track => track.paused ? 0 : track.volume);
    if (next === "boss") incoming.currentTime = 0;
    if (incoming.paused) {
      incoming.volume = 0;
    }
    const fade = () => {
      if (id !== this.transitionId) return;
      const beginning = performance.now();
      const frame = (now: number) => {
        if (id !== this.transitionId) return;
        const progress = Math.min(1, (now - beginning) / FADE_DURATION_MS);
        incoming.volume = Math.max(0, Math.min(1,
          fromIncoming + (this.volume - fromIncoming) * progress));
        outgoing.forEach((track, i) => {
          track.volume = Math.max(0, Math.min(1, fromOutgoing[i] * (1 - progress)));
        });
        if (progress < 1) this.animationFrame = requestAnimationFrame(frame);
        else {
          this.animationFrame = null;
          outgoing.forEach(track => track.pause());
        }
      };
      this.animationFrame = requestAnimationFrame(frame);
    };
    try {
      // Start the new track immediately on the event loop so browsers accept it.
      void incoming.play().then(fade).catch(() => {
        if (id !== this.transitionId) return;
        outgoing.forEach(track => track.pause());
        this.started = false;
        this.error = "Click to enable audio";
        this.renderUi();
      });
    } catch {
      if (id !== this.transitionId) return;
      outgoing.forEach(track => track.pause());
      this.started = false;
      this.error = "Audio playback unavailable";
      this.renderUi();
    }
  }

  private savePreferences(): void {
    try {
      window.localStorage.setItem(PREFERENCE_KEY,
        JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch { /* Storage is optional, not a gameplay dependency. */ }
  }

  private renderUi(): void {
    this.label.textContent = TRACK_NAMES[this.scene];
    this.toggle.replaceChildren(uiIcon(this.enabled?"speaker":"mute"),
      document.createTextNode(this.enabled?"Mute":"Unmute"));
    this.toggle.setAttribute("aria-pressed", String(!this.enabled));
    this.slider.value = String(Math.round(this.volume * 100));
    this.status.textContent = !this.enabled ? "Music off" : this.error ??
      (this.started ? "Playing" : "Starts after your first click or key press");
  }
}

export function setupSoundtrack(): SceneSoundtrack {
  return new SceneSoundtrack();
}
