import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  BOSS_MAX_HP, bossStrikeGeometry, createCombatPreview, stepCombatPreview,
  type CombatPreviewState, type ArenaCue,
} from "./arenaCombatMotion.ts";
import type { AdventurerState } from "./adventurers.ts";
import type { BossCombatReplay, BossReplayFrame } from "./bossCombatReplay.ts";
import { observeReplay } from "../replayDisclosure.ts";
import type { GameStore } from "./gameStore.ts";
import { heroDisplayNames } from "./heroIdentity.ts";
import { createHeroVisual } from "./heroVisual.ts";
import { createCaveTrollVisual, type CaveTrollVisual } from "./caveTrollVisual.ts";
import { buildCaveTrollArenaArt, paintCaveTrollFloor } from "./caveTrollArenaArt.ts";

type Fighter = { root: TransformNode; hp: number; max: number; alive: boolean };
type FocusTarget = { label: string; node: TransformNode; vantage: Vector3 };
const ROCK_RADIUS = 17.5;
const BOSS_HP = BOSS_MAX_HP;

/** Saved combat replays and training previews share meshes and spectator controls.
 * Both modes are read-only: only confirmed day ticks modify GameStore.
 */
export class Level6Arena {
  private scene: Scene | null = null;
  private camera: UniversalCamera | null = null;
  private hero: Fighter | null = null;
  private boss: Fighter | null = null;
  private fighter: AdventurerState | null = null;
  private targets: FocusTarget[] = [];
  private focusIndex = 0;
  private readonly pressed = new Set<string>();
  private active = false;
  private motion: CombatPreviewState | null = null;
  private replay: BossCombatReplay | null = null;
  private requestedReplayId: string | null = null;
  private replayTime = 0;
  private replayFrameIndex = 0;
  private replayFinished = false;
  private forcePreview = false;
  private readonly sourceToggle: HTMLButtonElement;
  private motionAccumulator = 0;
  private heroArm: TransformNode | null = null;
  private heroWeapon: TransformNode | null = null;
  private trollVisual: CaveTrollVisual | null = null;
  private projectiles: AbstractMesh[] = [];
  private telegraph: AbstractMesh | null = null;
  private slamTelegraph: AbstractMesh | null = null;
  private impactShockwave: Mesh | null = null;
  private readonly staminaText: HTMLElement;
  private readonly combatInfo: HTMLElement;
  private result: "fighting" | "victory" | "defeat" = "fighting";
  private heroLegs: TransformNode[] = [];
  private readonly panel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly focusText: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly bossText: HTMLElement;
  private readonly previewText: HTMLElement;
  private readonly musicToggle: HTMLButtonElement;

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly shopCamera: UniversalCamera,
    private readonly store: GameStore,
    private readonly onActiveChange: (active: boolean) => void = () => {},
  ) {
    this.panel = document.querySelector<HTMLElement>("#arena-hud")!;
    this.status = document.querySelector<HTMLElement>("#arena-status")!;
    this.focusText = document.querySelector<HTMLElement>("#arena-focus")!;
    this.healthText = document.querySelector<HTMLElement>("#arena-hero-health")!;
    this.bossText = document.querySelector<HTMLElement>("#arena-boss-health")!;
    this.previewText = document.querySelector<HTMLElement>("#arena-preview")!;
    this.musicToggle = document.querySelector<HTMLButtonElement>("#music-toggle")!;
    this.staminaText = document.querySelector<HTMLElement>("#arena-stamina")!;
    this.combatInfo = document.querySelector<HTMLElement>("#arena-combat-info")!;
    this.sourceToggle = document.querySelector<HTMLButtonElement>("#arena-source-toggle")!;
    this.sourceToggle.addEventListener("click", () => {
      this.toggleSource();
    });
    document.querySelector("#open-arena")!.addEventListener("click", () => this.open());
    document.querySelector("#close-arena")!.addEventListener("click", () => this.close());
    document.querySelector("#restart-arena")!.addEventListener("click", () => this.restart());
    // Capture input before the shop's old listeners. Spectating never interacts,
    // spends money, confirms End Day, or changes the shop player's movement.
    window.addEventListener("keydown", (event) => {
      if (!this.active) {
        if (event.code === "KeyV" && !event.repeat &&
          !document.querySelector("dialog[open]") &&
          !document.body.classList.contains("dungeon-active")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
        }
        return;
      }
      if (event.target instanceof Element && event.target.closest("#music-panel")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape" || event.code === "KeyV") this.close();
      else if (event.code === "Tab") this.nextFocus();
      else if (event.code === "KeyM") this.musicToggle.focus();
      else if (event.code === "KeyC" && !this.sourceToggle.hidden) this.toggleSource();
      else this.pressed.add(event.code);
    }, true);
    window.addEventListener("keyup", (event) => {
      if (!this.active) return;
      if (event.target instanceof Element && event.target.closest("#music-panel")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pressed.delete(event.code);
    }, true);
    window.addEventListener("blur", () => this.pressed.clear());
    canvas.addEventListener("pointerdown", (event) => {
      if (!this.active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    }, true);
    document.addEventListener("mousemove", (event) => {
      if (!this.active || document.pointerLockElement !== canvas || !this.camera) return;
      this.camera.rotation.y += event.movementX / 2700;
      this.camera.rotation.x = Math.max(-1.45, Math.min(1.45,
        this.camera.rotation.x + event.movementY / 2700));
    }, true);
  }

  get currentScene(): Scene | null { return this.active ? this.scene : null; }
  get isActive(): boolean { return this.active; }

  private toggleSource(): void {
    this.forcePreview = !this.forcePreview;
    this.restart();
  }

  open(eventId?: string): void {
    if (this.active || document.querySelector("dialog[open]") ||
      document.body.classList.contains("dungeon-active")) return;
    this.requestedReplayId=eventId??null;
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.onActiveChange(true);
    this.forcePreview = false;
    this.pressed.clear();
    this.panel.hidden = false;
    document.body.classList.add("arena-active");
    this.restart();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.onActiveChange(false);
    this.pressed.clear();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.panel.hidden = true;
    document.body.classList.remove("arena-active");
    this.scene?.dispose();
    this.scene = null;
    this.camera = null;
    this.hero = null;
    this.boss = null;
    this.motion = null;
    this.replay = null;
    this.requestedReplayId=null;
    this.projectiles = [];
    this.telegraph = null;
    this.slamTelegraph = null;
    this.impactShockwave = null;
    this.heroArm = null;
    this.heroWeapon = null;
    this.trollVisual = null;
    this.shopCamera.attachControl(this.canvas, true);
    this.canvas.focus();
  }

  restart(): void {
    if (!this.active) return;
    this.scene?.dispose();
    this.heroLegs = [];
    this.trollVisual = null;
    this.targets = [];
    this.projectiles = [];
    this.telegraph = null;
    this.slamTelegraph = null;
    this.impactShockwave = null;
    this.heroArm = null;
    this.heroWeapon = null;
    this.motionAccumulator = 0;
    this.replayTime = 0;
    this.replayFrameIndex = 0;
    this.replayFinished = false;
    this.result = "fighting";
    const state = this.store.state;
    const recorded = [...state.events].reverse()
      .find(event => event.type === "level6-combat" && event.combatReplay &&
        (!this.requestedReplayId || event.id===this.requestedReplayId));
    const saved=recorded?.combatReplay??null;
    this.replay = this.forcePreview ? null : saved;
    if(this.replay&&recorded)observeReplay(recorded.id);
    this.sourceToggle.hidden = !saved;
    this.sourceToggle.textContent = this.replay ? "Preview current expedition" : "Watch last saved combat";
    this.panel.dataset.replay = this.replay ? "recorded" : "preview";
    this.fighter = (this.replay
      ? state.adventurers.find(hero => hero.id === this.replay!.heroId)
      : null) ??
      state.adventurers.find(hero => hero.status === "expedition") ??
      state.adventurers.find(hero => hero.status === "at-shop") ??
      state.adventurers.find(hero => hero.status !== "dead") ?? null;
    this.motion = createCombatPreview({
      role: this.replay?.role ?? this.fighter?.role ?? "tank",
      sword: this.replay?.sword ?? (this.fighter?.equipment.weapon === "Iron Sword"),
      armor: this.replay?.armor ?? (this.fighter?.equipment.armor === "Leather Vest"),
      health: this.replay?.frames[0].heroHp ?? this.fighter?.health ?? 45,
      maxHealth: this.replay?.maxHp ?? this.fighter?.stats.maxHealth ?? 50,
      healingSupplies: this.fighter?.inventory.healing ?? 0,
    });
    if (this.replay) this.applyReplayFrame(this.replay.frames[0]);
    const realExpedition = this.fighter?.status === "expedition";
    const names = heroDisplayNames(state.adventurers);
    this.previewText.textContent = this.replay
      ? "RECORDED COMBAT · Day " + this.replay.day + " · " + this.replay.outcome +
        " · Exact saved fight, no additional damage or rewards."
      : realExpedition
        ? "EXPEDITION PREVIEW · Uncommitted training only. Confirm the day to record the real fight."
        : "TRAINING PREVIEW · No hero on Level 6. This duel changes no saved state.";
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.045, 0.035, 0.043, 1);
    this.scene = scene;
    const camera = new UniversalCamera("boss-spectator-camera", new Vector3(0, 12, -22), scene);
    camera.minZ = 0.2;
    camera.maxZ = 160;
    camera.fov = 0.86;
    camera.inertia = 0;
    this.camera = camera;
    scene.activeCamera = camera;
    const ambient = new HemisphericLight("arena-ambient", new Vector3(0, 1, 0), scene);
    ambient.intensity = .53;
    ambient.groundColor = Color3.FromHexString("#423e3b");
    const lavaLight = new PointLight("lava-glow", new Vector3(0, 2, 0), scene);
    lavaLight.diffuse = Color3.FromHexString("#da7152");
    lavaLight.intensity = .9;
    lavaLight.range = 38;
    const warmRim = new PointLight("troll-ember-rim",new Vector3(-7,10,7),scene);
    warmRim.diffuse = Color3.FromHexString("#f08b54");
    warmRim.intensity = 1.65; warmRim.range=26;
    const faceFill = new PointLight("troll-face-fill",new Vector3(5,8,-10),scene);
    faceFill.diffuse=Color3.FromHexString("#e2d8c9");
    faceFill.intensity=1.10; faceFill.range=31;
    const makeMat = (name: string, hex: string, emissive = false): StandardMaterial => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      if (emissive) mat.emissiveColor = Color3.FromHexString(hex).scale(0.9);
      mat.specularColor = new Color3(0.08, 0.06, 0.04);
      return mat;
    };
    const stone = makeMat("basalt", "#29282a");
    const darkRock = makeMat("cave-rock", "#302b2a");
    const lava = makeMat("molten-lava", "#481b13", true);
    lava.emissiveColor = Color3.FromHexString("#aa3318").scale(.34);
    const fire = makeMat("lava-fire", "#965632");
    paintCaveTrollFloor(scene,stone);
    const visibleRole = this.replay?.role ?? this.fighter?.role;
    const visibleSword = this.replay?.sword ?? (this.fighter?.equipment.weapon === "Iron Sword");
    const visibleArmor = this.replay?.armor ?? (this.fighter?.equipment.armor === "Leather Vest");
    const platform = MeshBuilder.CreateCylinder("boss-arena-stone", {
      diameter: ROCK_RADIUS * 2, height: 0.65, tessellation: 96,
    }, scene);
    platform.position.y = -0.35;
    platform.material = stone;
    const moltenGround = MeshBuilder.CreateCylinder("lethal-lava", {
      diameter: 47, height: 0.22, tessellation: 96,
    }, scene);
    moltenGround.position.y = -0.95;
    moltenGround.material = lava;
    const rim = MeshBuilder.CreateTorus("lava-ring", {
      diameter: 39, thickness: 2.3, tessellation: 96,
    }, scene);
    rim.position.y = -0.36;
    rim.material = fire;
    // Visual mine walls, supports and furnaces do not touch combat geometry.
    buildCaveTrollArenaArt(scene);
    const shockwave = MeshBuilder.CreateTorus("troll-maul-impact-dust",{
      diameter:2.8,thickness:.26,tessellation:42,
    },scene);
    shockwave.material=makeMat("maul-impact-stone-dust","#b28a62",true);
    shockwave.visibility=0;
    shockwave.position.y=.14;
    shockwave.isPickable=false;
    shockwave.checkCollisions=false;
    this.impactShockwave=shockwave;
    // Stable geometry only, not simulation RNG; concentric stalagmites around the arena.
    for (let i = 0; i < 34; i++) {
      const angle = i * 2.399963229728653;
      const radius = 19.8 + ((i * 7) % 7) * 0.55;
      const height = 1.6 + (i % 6) * 0.65;
      const spike = MeshBuilder.CreateCylinder("cavern-stalagmite-" + i, {
        diameterTop: 0.04, diameterBottom: 1.1 + (i % 3) * 0.35,
        height, tessellation: 6,
      }, scene);
      spike.position.set(Math.cos(angle) * radius, height / 2 - 0.7, Math.sin(angle) * radius);
      spike.material = i % 4 === 0 ? stone : darkRock;
    }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const shard = MeshBuilder.CreateBox("obsidian-shard-" + i, {
        width: 0.5, height: 0.15, depth: 1.8,
      }, scene);
      shard.position.set(Math.cos(a) * 16.4, 0.04, Math.sin(a) * 16.4);
      shard.rotation.y = a;
      shard.material = fire;
    }
    // Approved Ashen Tunnel Mauler design: a volumetric, art-directed,
    // phase-animated 3D boss. Combat ranges, hit ticks and saves still belong
    // exclusively to arenaCombatMotion.ts, not to these visual meshes.
    this.trollVisual = createCaveTrollVisual(scene);
    const boss = this.trollVisual.root;
    boss.position.set(0,0,2);
    this.trollVisual.animate({
      phase:"chase",phaseAge:0,slam:false,time:0,moved:0,
      delta:0,hp:BOSS_HP,maxHp:BOSS_HP,
    });
    this.boss = {root:boss,hp:BOSS_HP,max:BOSS_HP,alive:true};

    // The same geometry/identity factory is used by shop NPCs and future dungeons.
    // Recorded battles use their own historical gear snapshot, not today's gear.
    const heroId = this.replay?.heroId ?? this.fighter?.id ?? "preview";
    const heroModel = createHeroVisual(scene, {
      id: heroId,
      role: visibleRole ?? "tank",
      equipment: {
        weapon: visibleSword ? "Iron Sword" : null,
        armor: visibleArmor ? "Leather Vest" : null,
      },
    }, "arena-hero-" + heroId);
    const hero = heroModel.root;
    hero.position.set(0, 0, -9);
    hero.metadata = { ...hero.metadata, kind: "hero" };
    this.heroLegs.push(...heroModel.legs);
    this.heroArm = heroModel.arms[1];
    this.heroWeapon = heroModel.weaponPivot;
    this.hero = { root: hero, hp: this.motion.heroHp,
      max: this.motion.options.maxHealth, alive: true };
    const warningMaterial = makeMat("boss-warning-red", "#b82513", true);
    const createWarning = (name: string, slam: boolean): Mesh => {
      const { reach, halfAngleRadians } = bossStrikeGeometry(slam);
      const segments = 32;
      const positions = [0, 0.14, 0];
      const indices: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = -halfAngleRadians + (2 * halfAngleRadians * i) / segments;
        positions.push(Math.sin(angle) * reach, 0.14, Math.cos(angle) * reach);
        if (i < segments) indices.push(0, i + 1, i + 2);
      }
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      const mesh = new Mesh(name, scene);
      vertexData.applyToMesh(mesh);
      mesh.material = warningMaterial;
      mesh.visibility = 0;
      mesh.isPickable = false;
      return mesh;
    };
    this.telegraph = createWarning("boss-active-attack-warning", false);
    this.slamTelegraph = createWarning("boss-slam-attack-warning", true);
    const displayName = this.fighter ? names.get(this.fighter.id) ?? this.fighter.name : "Preview Hero";
    this.targets = [
      { label: displayName + " · " + (this.fighter?.role ?? "tank"), node: hero,
        vantage: new Vector3(4, 5, -8) },
      { label: "THE CAVE TROLL · BOSS", node: boss, vantage: new Vector3(10, 7, -11) },
    ];
    this.focusIndex = 0;
    this.focusCamera();
    this.status.textContent = this.replay
      ? "Recorded fight ready. The same committed actions will play back."
      : "The Cave Troll is guarding Level 6.";
    this.updateHud();
  }

  private nextFocus(): void {
    if (!this.targets.length) return;
    this.focusIndex = (this.focusIndex + 1) % this.targets.length;
    this.focusCamera();
  }

  private focusCamera(): void {
    const target = this.targets[this.focusIndex];
    if (!target || !this.camera) return;
    this.camera.position.copyFrom(target.node.position.add(target.vantage));
    const view = this.focusIndex === 0 && this.boss && this.hero
      ? Vector3.Lerp(this.hero.root.position, this.boss.root.position, .53)
        .addInPlace(new Vector3(0,3.2,0))
      : target.node.position.add(new Vector3(0,4.1,0));
    this.camera.setTarget(view);
    this.focusText.textContent = "TAB focus: " + target.label;
  }

  /** Preview combat advances at a fixed 60 Hz independent of render FPS. */
  update(deltaSeconds: number): void {
    if (!this.active || !this.scene || !this.camera || !this.hero || !this.boss || !this.motion) return;
    const frameDt = Math.min(0.1, Math.max(0, deltaSeconds));
    const speed = (this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight") ? 21 : 7) * frameDt;
    const yaw = this.camera.rotation.y;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (this.pressed.has("KeyW")) this.camera.position.addInPlace(forward.scale(speed));
    if (this.pressed.has("KeyS")) this.camera.position.subtractInPlace(forward.scale(speed));
    if (this.pressed.has("KeyD")) this.camera.position.addInPlace(right.scale(speed));
    if (this.pressed.has("KeyA")) this.camera.position.subtractInPlace(right.scale(speed));
    if (this.pressed.has("KeyQ")) this.camera.position.y += speed;
    if (this.pressed.has("KeyE")) this.camera.position.y -= speed;
    this.camera.position.y = Math.max(1.2, Math.min(65, this.camera.position.y));

    if (this.replay) {
      this.updateRecordedFight(frameDt);
      return;
    }
    this.motionAccumulator += frameDt;
    const fixedDt = 1 / 60;
    let ticks = 0;
    while (this.motionAccumulator >= fixedDt && ticks++ < 6) {
      const cues = stepCombatPreview(this.motion, fixedDt);
      for (const cue of cues) this.displayCue(cue);
      this.motionAccumulator -= fixedDt;
    }
    this.paintCombat(frameDt);
  }

  /** Restore state strictly from a recorded frame; NEVER invoke the combat AI. */
  private applyReplayFrame(frame: BossReplayFrame): void {
    const state = this.motion;
    if (!state) return;
    state.time = frame.t;
    state.hero.x = frame.hx;
    state.hero.z = frame.hz;
    state.boss.x = frame.bx;
    state.boss.z = frame.bz;
    state.heroHeading = frame.hh;
    state.bossHeading = frame.bh;
    state.lockedBossHeading = frame.lock;
    state.bossSlam = frame.slam;
    state.distanceTraveled = frame.travel;
    state.heroHp = frame.heroHp;
    state.bossHp = frame.bossHp;
    state.stamina = frame.stamina;
    state.heroPhase = frame.heroPhase;
    state.heroAge = frame.heroAge;
    state.bossPhase = frame.bossPhase;
    state.bossAge = frame.bossAge;
    state.projectiles = frame.projectiles.map(([x,z]) =>
      ({x,z,dx:0,dz:0,damage:0,ttl:1}));
    state.dodgeCount = frame.dodgeCount;
    state.parryCount = frame.parryCount;
    state.landedHits = frame.landedHits;
    state.missedHits = frame.missedHits;
  }

  private updateRecordedFight(dt: number): void {
    const replay = this.replay;
    if (!replay || !this.motion) return;
    const frames = replay.frames;
    const end = frames[frames.length-1].t;
    this.replayTime = Math.min(end, this.replayTime + dt);
    while (this.replayFrameIndex + 1 < frames.length &&
      frames[this.replayFrameIndex+1].t <= this.replayTime) {
      this.replayFrameIndex++;
      for (const cue of frames[this.replayFrameIndex].cues) this.displayCue(cue);
    }
    const current = frames[this.replayFrameIndex];
    const next = frames[Math.min(this.replayFrameIndex+1,frames.length-1)];
    this.applyReplayFrame(current);
    if (next.t > current.t) {
      const alpha = Math.min(1, Math.max(0,
        (this.replayTime-current.t)/(next.t-current.t)));
      this.motion.hero.x += (next.hx-current.hx)*alpha;
      this.motion.hero.z += (next.hz-current.hz)*alpha;
      this.motion.boss.x += (next.bx-current.bx)*alpha;
      this.motion.boss.z += (next.bz-current.bz)*alpha;
      if (current.heroPhase===next.heroPhase) this.motion.heroAge +=
        (next.heroAge-current.heroAge)*alpha;
      if (current.bossPhase===next.bossPhase) this.motion.bossAge +=
        (next.bossAge-current.bossAge)*alpha;
    }
    this.motion.time = this.replayTime;
    if (this.replayTime >= end && !this.replayFinished) {
      this.replayFinished = true;
      this.motion.outcome = replay.outcome === "death" ? "defeat" :
        replay.outcome === "victory" ? "victory" : "fighting";
      this.status.textContent = replay.outcome === "death"
        ? "RECORDED DEATH · The hero died in the saved campaign."
        : replay.outcome === "victory"
          ? "RECORDED VICTORY · The Cave Troll was defeated in the saved campaign."
          : "RECORDED RETREAT · The hero escaped the real encounter.";
    } else if (this.replayFinished) {
      this.motion.outcome = replay.outcome === "death" ? "defeat" :
        replay.outcome === "victory" ? "victory" : "fighting";
    }
    this.paintCombat(dt);
  }

  private displayCue(cue: ArenaCue): void {
    const value = cue.amount === undefined ? "" : " (" + cue.amount + " HP)";
    const messages: Record<ArenaCue["kind"], string> = {
      windup: "TROLL WINDUP · Dodge the glowing attack lane!",
      dodge: "DODGED · Hit avoided during real invulnerability frames.",
      parry: "PARRY! A timed, facing block staggered the Cave Troll.",
      miss: "MISSED · Target outside the active strike range or arc.",
      hit: "TROLL HIT" + value + " · The club made contact.",
      "hero-hit": "HERO HIT" + value + " · An attack reached its target.",
      projectile: "Spell fired! Moving projectile must reach the boss.",
      heal: "HEALED" + value + " · The uninterrupted cast completed.",
      stagger: "BOSS STAGGERED · Successful parry.",
      lava: "LAVA · The hero crossed the deadly arena boundary.",
      victory: this.replay ? "SAVED VICTORY · The troll fell in the recorded campaign." :
        "VICTORY · Cave Troll defeated. Preview only.",
      defeat: this.replay ? "SAVED DEATH · Hero fell in the recorded campaign." :
        "DEFEAT · Hero fell in combat. Preview only.",
    };
    this.status.textContent = messages[cue.kind];
  }

  private paintCombat(frameDt: number): void {
    const state = this.motion;
    if (!state || !this.hero || !this.boss || !this.scene) return;
    const hero = this.hero, boss = this.boss;
    const oldHeroX = hero.root.position.x, oldHeroZ = hero.root.position.z;
    const oldBossX = boss.root.position.x, oldBossZ = boss.root.position.z;
    hero.root.position.set(state.hero.x, 0, state.hero.z);
    boss.root.position.set(state.boss.x, 0, state.boss.z);
    hero.root.rotation.y = state.heroHeading;
    boss.root.rotation.y = state.bossHeading;
    hero.hp = state.heroHp;
    boss.hp = state.bossHp;
    hero.alive = state.outcome !== "defeat";
    boss.alive = state.outcome !== "victory";

    const movedHero = Math.hypot(state.hero.x - oldHeroX, state.hero.z - oldHeroZ);
    const movedBoss = Math.hypot(state.boss.x - oldBossX, state.boss.z - oldBossZ);
    for (const [index, leg] of this.heroLegs.entries()) {
      leg.rotation.x = movedHero > 0.005 && state.heroPhase === "move"
        ? Math.sin(state.time * 12 + index * Math.PI) * 0.50 : 0;
    }
    this.trollVisual?.animate({
      phase: state.bossPhase,
      phaseAge: state.bossAge,
      slam: state.bossSlam,
      time: state.time,
      moved: movedBoss,
      delta: frameDt,
      hp: state.bossHp,
      maxHp: BOSS_HP,
    });
    if (this.heroArm) {
      const attacking = state.heroPhase === "attack";
      const casting = state.heroPhase === "cast" || state.heroPhase === "heal";
      this.heroArm.rotation.z = attacking
        ? Math.sin(Math.min(1, state.heroAge / 0.6) * Math.PI) * -2.1
        : state.heroPhase === "parry" ? -1.1 : casting ? -0.9 : 0;
    }
    if (this.heroWeapon) {
      const attacking = state.heroPhase === "attack";
      this.heroWeapon.rotation.x = attacking ? -0.65 : 0;
    }
    // A roll actually translates the hero sideways, then rotates the body.
    if (state.heroPhase === "roll") {
      hero.root.rotation.z = Math.sin(Math.min(1, state.heroAge / 0.53) * Math.PI) * 1.0;
      hero.root.rotation.x = Math.PI * 2 * Math.min(1, state.heroAge / 0.53);
    } else {
      hero.root.rotation.x = 0;
      hero.root.rotation.z = state.outcome === "defeat" ? Math.PI / 2
        : state.heroPhase === "hurt" ? -0.25 : 0;
    }
    if(this.impactShockwave) {
      const impact=state.bossPhase==="strike" ? Math.max(0,state.bossAge-.10) : -1;
      this.impactShockwave.visibility=impact>=0&&impact<.36
        ? .46*(1-impact/.36):0;
      this.impactShockwave.scaling.setAll(1+Math.max(0,impact)*5.1);
      this.impactShockwave.position.set(state.boss.x,.14,state.boss.z);
    }
    for (const [telegraph, slam] of [[this.telegraph, false], [this.slamTelegraph, true]] as const) {
      if (!telegraph) continue;
      telegraph.visibility = state.bossPhase === "windup" && state.bossSlam === slam ? 0.48 : 0;
      telegraph.position.set(state.boss.x, 0, state.boss.z);
      telegraph.rotation.y = state.lockedBossHeading;
    }
    // Moving projectiles visually match collidable projectile positions from the motor.
    while (this.projectiles.length > state.projectiles.length) this.projectiles.pop()!.dispose();
    while (this.projectiles.length < state.projectiles.length) {
      const orb = MeshBuilder.CreateSphere("hero-live-projectile", { diameter: 0.55 }, this.scene);
      const mat = new StandardMaterial("projectile-aura", this.scene);
      mat.diffuseColor = new Color3(0.2, 0.65, 1);
      mat.emissiveColor = new Color3(0.25, 0.8, 1);
      orb.material = mat;
      orb.isPickable = false;
      this.projectiles.push(orb);
    }
    state.projectiles.forEach((projectile, index) =>
      this.projectiles[index].position.set(projectile.x, 1.7, projectile.z));
    hero.root.metadata.combatPhase = state.heroPhase;
    hero.root.metadata.stamina = state.stamina;
    hero.root.metadata.previewHp = state.heroHp;
    hero.root.metadata.distanceTraveled = state.distanceTraveled;
    boss.root.metadata.combatPhase = state.bossPhase;
    boss.root.metadata.previewHp = state.bossHp;
    boss.root.metadata.missedHits = state.missedHits;
    boss.root.metadata.dodgeCount = state.dodgeCount;
    boss.root.metadata.parryCount = state.parryCount;
    this.result = state.outcome;
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.hero || !this.boss) return;
    this.healthText.textContent = "HERO HP " + this.hero.hp + "/" + this.hero.max;
    this.bossText.textContent = "CAVE TROLL HP " + this.boss.hp + "/" + this.boss.max;
    if (this.motion) {
      this.staminaText.textContent = "STAMINA " + Math.round(this.motion.stamina) + "/100";
      this.combatInfo.textContent = "Hero: " + this.motion.heroPhase +
        " · Troll: " + this.motion.bossPhase +
        " · Dodges " + this.motion.dodgeCount + " · Parries " + this.motion.parryCount +
        " · Connected hits " + this.motion.landedHits;
    }
    this.panel.dataset.result = this.replay?.outcome ??
      (this.result === "defeat" ? "death" : this.result);
  }
}
