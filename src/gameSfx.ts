import type { ArenaCue } from "./game/arenaCombatMotion.ts";
import {
  blankSfxDebugFilters,passesSfxDebugFilter,sfxDetails,
  SFX_OWNERS,SFX_FAMILIES,
  type GameSfxCue,type SfxAxis,type SfxOwner,type SfxFamily,type SfxDebugFilters,
} from "./sfxCatalog.ts";
export type { GameSfxCue } from "./sfxCatalog.ts";
import {
  SFX_SAMPLE_DIR,SFX_SAMPLE_FILES,hasRecordedSfx,selectSfxSample,
} from "./gameSfxSamples.ts";

export type SfxDebugStatus="triggered"|"filtered"|"muted"|"throttled"|"loading"|"blocked";
export interface SfxDebugEvent {
  readonly cue:GameSfxCue;
  readonly status:SfxDebugStatus;
  readonly audition:boolean;
}

/**
 * Curated Troll MP3s and Ghoul WAVs replace synthesized creature cues; others
 * remain explicit prototypes. Presentation never modifies combat or replay.
 */
export interface SoundPosition { readonly x: number; readonly z: number }
export interface SoundListener extends SoundPosition { readonly yaw: number }

const STORAGE_KEY = "dungeon-shop-master-sfx-v1";
const DEFAULT_VOLUME = 0.65;
const SPACING: Partial<Record<GameSfxCue, number>> = {
  "troll-step": 0.19, "hero-step": 0.13, "troll-breath": 2.8,
  "ghoul-aggro": 1.8, "ghoul-growl": 2.2, "ghoul-attack": .35,
  "ghoul-hurt": .13, "ghoul-stagger": .30, "ghoul-death": .12,
  "ghoul-claw-whiff": .09, "ghoul-claw-hit": .09,
  "ghoul-leap-takeoff": .4, "ghoul-leap-air": .4, "ghoul-leap-land": .3,
  "troll-grunt": 0.65, "boss-hurt": 0.48, "lava-burn": 0.45, "rock-crumble": 0.15,
  "fishing-cast": .30,"fishing-bite": .30,"fishing-flick": .12,
  "fishing-miss": .20,"fishing-catch": .4,
};

/** The same live or saved motor cue means the same sound; no guessed damage. */
export function arenaCueSfx(
  kind: ArenaCue["kind"], bossStriking = true, missedGrab = false,
): readonly GameSfxCue[] {
  switch (kind) {
    case "windup": return ["troll-grunt"];
    case "dodge": return ["dodge", "troll-impact"];
    case "parry": return ["shield-parry"];
    case "miss": return missedGrab ? ["troll-swing"] :
      bossStriking ? ["troll-impact", "rock-crumble"] : ["hero-attack"];
    case "hit": return ["troll-impact", "hero-hurt"];
    case "hero-hit": return ["boss-hurt"];
    case "grab": return ["troll-grunt", "hero-hurt"];
    case "throw": return ["troll-swing"];
    case "projectile": return ["projectile"];
    case "heal": return ["heal"];
    case "stagger": return ["stagger"];
    case "lava": return ["lava-burn"];
    case "victory": return ["troll-death"];
    case "defeat": return ["hero-death"];
  }
}

function loadSfxPreferences(): { enabled: boolean; volume: number } {
  const defaults = { enabled: true, volume: DEFAULT_VOLUME };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return defaults;
    const pref = value as Partial<typeof defaults>;
    return {
      enabled: typeof pref.enabled === "boolean" ? pref.enabled : defaults.enabled,
      volume: typeof pref.volume === "number" && Number.isFinite(pref.volume)
        ? Math.max(0, Math.min(1, pref.volume)) : defaults.volume,
    };
  } catch { return defaults; }
}

export class GameSfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly sampleBuffers=new Map<string,AudioBuffer>();
  private readonly sampleLoading=new Set<string>();
  private readonly sampleFailures=new Set<string>();
  private readonly sampleSources=new Set<AudioBufferSourceNode>();
  private readonly sampleSequences=new Map<GameSfxCue,number>();
  private lavaSource: AudioBufferSourceNode | null = null;
  private lavaOscillator: OscillatorNode | null = null;
  private readonly toggle: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private enabled: boolean;
  private volume: number;
  private arenaMixActive = false;
  private arenaVolume = 0.40;
  private inArena = false;
  private variation = 0;
  private readonly last = new Map<GameSfxCue, number>();
  private previewDebug = false;
  private debugFilters:SfxDebugFilters=blankSfxDebugFilters();
  private debugObserver:((event:SfxDebugEvent)=>void)|null=null;

  constructor() {
    const pref = loadSfxPreferences();
    this.enabled = pref.enabled;
    this.volume = pref.volume;
    this.toggle = document.querySelector<HTMLButtonElement>("#sfx-toggle")!;
    this.slider = document.querySelector<HTMLInputElement>("#sfx-volume")!;
    this.toggle.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this.persist();
      if (this.enabled) this.preloadSamples();
      this.syncAmbient();
      this.render();
    });
    this.slider.addEventListener("input", () => {
      const value = Math.max(0, Math.min(1, Number(this.slider.value) / 100));
      if (this.arenaMixActive) this.arenaVolume = value;
      else { this.volume = value; this.persist(); }
      if (this.enabled && this.soundVolume > 0) this.preloadSamples();
      this.syncMaster();
      this.syncAmbient();
      this.render();
    });
    const unlock = (event: Event) => {
      if (event instanceof KeyboardEvent &&
          (event.repeat || ["Tab", "Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
      if (this.enabled) this.preloadSamples();
    };
    // Real user gesture, capture phase: survives pointer lock and game controls.
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    this.render();
  }

  get soundEnabled(): boolean { return this.enabled; }
  get soundVolume(): number {
    return this.arenaMixActive ? this.arenaVolume : this.volume;
  }

  /** The arena SFX preset changes only the active preview mix. Exiting V
   * restores the exact shop settings, including any persisted custom volume. */
  setArenaMix(active: boolean): void {
    if (this.arenaMixActive === active) return;
    this.arenaMixActive = active;
    if (active) this.arenaVolume = 0.40;
    this.syncMaster();
    this.syncAmbient();
    this.render();
  }
  get debugActive():boolean { return this.previewDebug; }
  get previewFilters():SfxDebugFilters { return this.debugFilters; }

  /** Debug mode is available only inside an unsaved Level 6 training preview.
   * Filters reset on leaving, so no effect can leak into recorded battles/shop. */
  setPreviewDebugActive(active:boolean):void {
    if(this.previewDebug===active)return;
    this.previewDebug=active;
    this.debugFilters=blankSfxDebugFilters();
    this.last.clear();
    this.syncAmbient();
  }

  onPreviewCue(callback:((event:SfxDebugEvent)=>void)|null):void {
    this.debugObserver=callback;
  }

  togglePreviewGroup(axis:"owner",id:SfxOwner,mode:"solo"|"mute"):void;
  togglePreviewGroup(axis:"family",id:SfxFamily,mode:"solo"|"mute"):void;
  togglePreviewGroup(axis:SfxAxis,id:SfxOwner|SfxFamily,mode:"solo"|"mute"):void {
    if(!this.previewDebug)return;
    if(axis==="owner"){
      if(!SFX_OWNERS.some(item=>item.id===id))return;
      const owner=id as SfxOwner;
      if(mode==="solo"){
        this.debugFilters={...this.debugFilters,
          soloOwner:this.debugFilters.soloOwner===owner?null:owner,
          mutedOwners:new Set([...this.debugFilters.mutedOwners].filter(item=>item!==owner))};
      }else{
        const muted=new Set(this.debugFilters.mutedOwners);
        if(muted.has(owner))muted.delete(owner);else muted.add(owner);
        this.debugFilters={...this.debugFilters,mutedOwners:muted,
          soloOwner:muted.has(owner)&&this.debugFilters.soloOwner===owner
            ?null:this.debugFilters.soloOwner};
      }
    }else{
      if(!SFX_FAMILIES.some(item=>item.id===id))return;
      const family=id as SfxFamily;
      if(mode==="solo"){
        this.debugFilters={...this.debugFilters,
          soloFamily:this.debugFilters.soloFamily===family?null:family,
          mutedFamilies:new Set([...this.debugFilters.mutedFamilies].filter(item=>item!==family))};
      }else{
        const muted=new Set(this.debugFilters.mutedFamilies);
        if(muted.has(family))muted.delete(family);else muted.add(family);
        this.debugFilters={...this.debugFilters,mutedFamilies:muted,
          soloFamily:muted.has(family)&&this.debugFilters.soloFamily===family
            ?null:this.debugFilters.soloFamily};
      }
    }
    this.syncAmbient();
  }

  resetPreviewMix():void {
    if(!this.previewDebug)return;
    this.debugFilters=blankSfxDebugFilters();
    this.syncAmbient();
  }

  /** Explicit A/B sample button: bypass temporary preview category filters,
   * but respect the user's master SFX mute and volume setting. */
  audition(cue:GameSfxCue):void {
    if(!this.previewDebug)return;
    this.play(cue,undefined,undefined,true);
  }

  private logCue(event:SfxDebugEvent):void {
    if(this.previewDebug)this.debugObserver?.(event);
  }

  private passesPreviewMix(owner:SfxOwner,family:SfxFamily):boolean {
    return !this.previewDebug||passesSfxDebugFilter(owner,family,this.debugFilters);
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY,
        JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch { /* Private browsing is supported. */ }
  }

  private render(): void {
    this.toggle.textContent = this.enabled ? "SFX on" : "SFX off";
    this.toggle.setAttribute("aria-pressed", String(!this.enabled));
    this.slider.value = String(Math.round(this.soundVolume * 100));
  }

  private syncMaster(): void {
    if (this.master) this.master.gain.value = this.enabled ? this.soundVolume * 0.58 : 0;
  }

  /** Allocate only on a browser gesture or an allowed play attempt. */
  private unlock(): AudioContext | null {
    if (!this.enabled || this.soundVolume === 0 || typeof AudioContext === "undefined") return null;
    try {
      if (!this.context) {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -13;
        limiter.knee.value = 12;
        limiter.ratio.value = 5;
        master.connect(limiter);
        limiter.connect(ctx.destination);
        this.context = ctx;
        this.master = master;
        this.syncMaster();
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.5), ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        // A private fixed noise source; never use the gameplay random stream.
        let seed = 0x7f4a7c15;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = (seed / 2147483648) - 1;
        }
        this.noiseBuffer = buffer;
      }
      if (this.context.state === "suspended") {
        void this.context.resume().catch(() => { /* Sound remains optional. */ });
      }
      return this.context;
    } catch { return null; }
  }

  private route(position?: SoundPosition, listener?: SoundListener): GainNode | null {
    const ctx = this.context;
    if (!ctx || !this.master) return null;
    const output = ctx.createGain();
    if (position && listener) {
      const dx = position.x - listener.x, dz = position.z - listener.z;
      const distance = Math.hypot(dx, dz);
      output.gain.value = Math.max(0.22, 1 / (1 + distance * 0.045));
      const stereo = ctx.createStereoPanner();
      const right = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
      stereo.pan.value = Math.max(-0.72, Math.min(0.72, right / Math.max(5, distance)));
      output.connect(stereo);
      stereo.connect(this.master);
    } else output.connect(this.master);
    return output;
  }

  /** Decode each reviewed asset once after a user gesture. Never await the
   * network in the deterministic motor or on the cinematic's sound tick. */
  /** Decode on a real spectator gesture, without starting the Troll lava ambience. */
  prepareCombatSamples():void {this.preloadSamples();}

  private preloadSamples():void {
    const ctx=this.unlock();
    if(!ctx)return;
    for(const filename of SFX_SAMPLE_FILES)this.queueSample(filename,ctx);
  }

  private queueSample(filename:string,ctx:AudioContext):void {
    if(this.sampleBuffers.has(filename)||this.sampleLoading.has(filename)||
       this.sampleFailures.has(filename))return;
    this.sampleLoading.add(filename);
    void fetch(import.meta.env.BASE_URL+SFX_SAMPLE_DIR+filename.split("/").map(encodeURIComponent).join("/"))
      .then(response=>{
        if(!response.ok)throw new Error("SFX HTTP "+response.status);
        return response.arrayBuffer();
      })
      .then(bytes=>ctx.decodeAudioData(bytes))
      .then(buffer=>{this.sampleBuffers.set(filename,buffer);})
      .catch(error=>{
        this.sampleFailures.add(filename);
        console.warn("Recorded SFX unavailable:",filename,error);
      })
      .finally(()=>{this.sampleLoading.delete(filename);});
  }

  /** Stop arena samples on exit so long death rattles do not leak into the shop. */
  stopCombatSamples():void {this.stopSamples();}

  private stopSamples():void {
    for(const source of this.sampleSources){
      try{source.stop();}catch{ /* Already ended. */ }
      source.disconnect();
    }
    this.sampleSources.clear();
  }

  /** Same master, limiter, stereo/distance routing and SFX Lab controls as synths. */
  private playSample(cue:GameSfxCue,ctx:AudioContext,output:GainNode,
    now:number,heavy:boolean):boolean {
    const index=this.sampleSequences.get(cue)??0;
    const spec=selectSfxSample(cue,index,heavy);
    if(!spec)return false;
    const buffer=this.sampleBuffers.get(spec.file);
    if(!buffer)return false;
    const source=ctx.createBufferSource();
    source.buffer=buffer;
    source.playbackRate.value=cue==="troll-roar"?1:0.985+(index%3)*0.015;
    const envelope=ctx.createGain();
    const duration=Math.min(spec.maxSeconds,buffer.duration/source.playbackRate.value);
    const fade=Math.min(.13,duration*.23);
    envelope.gain.setValueAtTime(spec.gain,now);
    envelope.gain.setValueAtTime(spec.gain,now+Math.max(0,duration-fade));
    envelope.gain.linearRampToValueAtTime(.0001,now+duration);
    source.connect(envelope);envelope.connect(output);
    source.onended=()=>{
      this.sampleSources.delete(source);
      source.disconnect();envelope.disconnect();output.disconnect();
    };
    source.start(now);
    source.stop(now+duration+.005);
    this.sampleSources.add(source);
    this.sampleSequences.set(cue,index+1);
    return true;
  }

  private tone(
    out: AudioNode, at: number, duration: number,
    frequency: number, endFrequency: number, level: number,
    type: OscillatorType = "sine",
  ): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + Math.min(0.022, duration * 0.18));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(envelope); envelope.connect(out);
    osc.start(at); osc.stop(at + duration + 0.015);
  }

  private noise(
    out: AudioNode, at: number, duration: number,
    cutoff: number, level: number, filterType: BiquadFilterType = "lowpass",
    playbackRate = 1,
  ): void {
    const ctx = this.context!;
    if (!this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = filterType === "bandpass" ? 0.8 : 0.2;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(out);
    source.start(at); source.stop(at + duration + 0.02);
  }

  play(cue: GameSfxCue, position?: SoundPosition, listener?: SoundListener,
    audition=false, heavy=false): void {
    const log=(status:SfxDebugStatus)=>
      this.logCue({cue,status,audition});
    if (!this.enabled || this.soundVolume <= 0){log("muted");return;}
    const details=sfxDetails(cue);
    if(!audition&&!this.passesPreviewMix(details.owner,details.family)){
      log("filtered");return;
    }
    const ctx = this.unlock();
    if (!ctx || ctx.state === "closed"){log("blocked");return;}
    const now = ctx.currentTime;
    const last = this.last.get(cue) ?? -Infinity;
    if (!audition && now - last < (SPACING[cue] ?? 0.045)){
      log("throttled");return;
    }
    if(hasRecordedSfx(cue)){
      const spec=selectSfxSample(cue,this.sampleSequences.get(cue)??0,heavy);
      if(!spec){log("blocked");return;}
      if(!this.sampleBuffers.has(spec.file)){
        this.queueSample(spec.file,ctx);
        log(this.sampleFailures.has(spec.file)?"blocked":"loading");
        return;
      }
    }
    const output = this.route(position, listener);
    if (!output){log("blocked");return;}
    if(hasRecordedSfx(cue)){
      try{
        if(!this.playSample(cue,ctx,output,now,heavy)){log("blocked");return;}
      }catch(error){console.warn("Recorded SFX playback failed:",cue,error);log("blocked");return;}
      this.last.set(cue,now);log("triggered");return;
    }
    this.last.set(cue,now);
    log("triggered");
    const variant = (this.variation++ % 5) - 2;
    const pitch = 1 + variant * 0.035;
    const rumble = (d: number, f = 65, amp = 0.28) =>
      this.tone(output, now, d, f * pitch, f * 0.54 * pitch, amp, "triangle");
    const grit = (d: number, cutoff = 500, amp = 0.24) =>
      this.noise(output, now, d, cutoff, amp);
    switch (cue) {
      case "troll-breath":
        this.noise(output, now, .84, 190, .19, "lowpass", .67);
        this.tone(output, now, .75, 53*pitch, 48*pitch, .085, "triangle");
        break;
      case "hero-step":
        this.noise(output, now, .12, 450, .12);
        this.tone(output, now, .09, 135*pitch, 78*pitch, .08, "triangle");
        break;
      case "hero-hurt":
        this.tone(output, now, .34, 240*pitch, 125*pitch, .20, "sawtooth");
        this.noise(output, now, .20, 800, .12, "bandpass");
        break;
      case "hero-attack":
        this.noise(output, now, .24, 1350, .21, "bandpass", 1.45);
        this.tone(output, now, .12, 420*pitch, 220*pitch, .07, "triangle");
        break;
      case "projectile":
        this.tone(output, now, .35, 640*pitch, 155*pitch, .16, "sine");
        this.noise(output, now, .25, 2200, .15, "bandpass", 1.7);
        break;
      case "shield-parry":
        this.tone(output, now, .28, 740*pitch, 310*pitch, .22, "triangle");
        this.tone(output, now+.025, .38, 1120*pitch, 550*pitch, .13, "sine");
        this.noise(output, now, .12, 2900, .17, "highpass");
        break;
      case "dodge":
        this.noise(output, now, .26, 1500, .17, "bandpass", 1.4);
        break;
      case "stagger":
        this.tone(output, now, .42, 125*pitch, 72*pitch, .22, "sawtooth");
        this.noise(output, now, .23, 520, .18);
        break;
      case "heal":
        this.tone(output, now, .64, 340*pitch, 580*pitch, .115, "sine");
        this.tone(output, now+.10, .57, 510*pitch, 810*pitch, .09, "sine");
        break;
      case "lava-burn":
        this.noise(output, now, .56, 1050, .20, "bandpass", .85);
        this.tone(output, now+.02, .30, 90*pitch, 66*pitch, .11, "triangle");
        break;
      case "troll-death":
        this.tone(output, now, 1.75, 116*pitch, 32*pitch, .36, "sawtooth");
        this.noise(output, now+.13, 1.6, 300, .29, "bandpass", .70);
        this.tone(output, now+1.15, .75, 80, 34, .34, "triangle");
        break;
      case "hero-death":
        this.tone(output, now, .72, 270*pitch, 65*pitch, .25, "sawtooth");
        this.noise(output, now+.12, .43, 420, .15);
        break;
      case "rock-crumble":
        this.noise(output, now, .56, 350, .30, "lowpass", .75);
        this.noise(output, now+.085, .28, 1500, .11, "bandpass");
        break;
      case "fishing-cast":
        this.noise(output,now,.32,1050,.20,"bandpass",.85);
        this.tone(output,now+.13,.22,280*pitch,110*pitch,.11,"sine");
        break;
      case "fishing-bite":
        this.noise(output,now,.19,1800,.22,"bandpass",1.1);
        this.tone(output,now+.05,.24,680*pitch,310*pitch,.17,"sine");
        break;
      case "fishing-flick":
        this.noise(output,now,.16,2300,.15,"bandpass",1.4);
        this.tone(output,now,.12,350*pitch,520*pitch,.08,"triangle");
        break;
      case "fishing-miss":
        this.tone(output,now,.34,190*pitch,85*pitch,.15,"triangle");
        this.noise(output,now+.08,.22,600,.08,"lowpass");
        break;
      case "fishing-catch":
        this.tone(output,now,.22,460*pitch,650*pitch,.19,"sine");
        this.tone(output,now+.17,.38,630*pitch,970*pitch,.16,"triangle");
        this.noise(output,now+.03,.40,1800,.14,"bandpass");
        break;
    }
  }

  playCombatCue(cue: ArenaCue, hero: SoundPosition, boss: SoundPosition,
    listener?: SoundListener, bossStriking = true, slam = false,
    missedGrab = false): void {
    const nearBoss = cue.kind === "windup" || cue.kind === "grab" ||
      cue.kind === "throw" || cue.kind === "hero-hit" ||
      cue.kind === "stagger" || cue.kind === "victory";
    for (const id of arenaCueSfx(cue.kind, bossStriking, missedGrab)) {
      const anchor = id === "troll-impact" || id === "troll-grunt" ? boss :
        nearBoss ? boss : hero;
      this.play(id, anchor, listener, false, slam && id==="troll-impact");
    }
  }

  beginArena(): void {
    this.inArena = true;
    this.last.clear();
    this.stopAmbient();
    this.preloadSamples();
    this.syncAmbient();
  }

  endArena(): void {
    this.inArena = false;
    this.stopAmbient();
    this.stopSamples();
    this.last.clear();
  }

  private syncAmbient():void {
    if(!this.inArena||!this.enabled||this.volume<=0||
      !this.passesPreviewMix("world","environment")){
      this.stopAmbient();return;
    }
    this.beginAmbient();
  }

  private beginAmbient(): void {
    if (!this.inArena || !this.enabled || this.soundVolume <= 0 || this.lavaSource ||
      !this.passesPreviewMix("world","environment")) return;
    const ctx = this.unlock();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.42;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 145;
    const gain = ctx.createGain();
    gain.gain.value = 0.047;
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 0.26;
    const modulation = ctx.createGain();
    modulation.gain.value = 0.026;
    oscillator.connect(modulation); modulation.connect(gain.gain);
    source.start(); oscillator.start();
    this.lavaSource = source;
    this.lavaOscillator = oscillator;
  }

  private stopAmbient(): void {
    try { this.lavaSource?.stop(); } catch { /* Already stopped. */ }
    try { this.lavaOscillator?.stop(); } catch { /* Already stopped. */ }
    this.lavaSource?.disconnect();
    this.lavaOscillator?.disconnect();
    this.lavaSource = null;
    this.lavaOscillator = null;
  }
}

export function setupGameSfx(): GameSfx { return new GameSfx(); }
