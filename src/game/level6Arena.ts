import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import { GRAPPLE_TIMING } from "./arenaCombatMotion.ts";
import type { AdventurerState } from "./adventurers.ts";
import type { BossCombatReplay, BossReplayFrame } from "./bossCombatReplay.ts";
import { observeReplay } from "../replayDisclosure.ts";
import type { GameStore } from "./gameStore.ts";
import { heroDisplayNames } from "./heroIdentity.ts";
import { createHeroVisual } from "./heroVisual.ts";
import { createCaveTrollVisual, type CaveTrollVisual } from "./caveTrollVisual.ts";
import { createTripoCaveTrollVisual } from "./tripoCaveTrollVisual.ts";
import { airborneRootFromGrip } from "./tripoGripPresentation.ts";
import { buildCaveTrollArenaArt, paintCaveTrollFloor } from "./caveTrollArenaArt.ts";
import { BOSS_INTRO_SECONDS, sampleBossIntro } from "./bossCinematic.ts";
import { sampleMaulerImpact } from "./maulerImpactPresentation.ts";
import { BossCombatHud } from "./bossCombatHud.ts";
import { BossModelLab } from "./bossModelLab.ts";
import { nextBossTrainingScenario, type BossTrainingScenario } from "./bossTrainingScenario.ts";
import { DeveloperCombatLab } from "./developerCombatLab.ts";
import type { GameSfx, GameSfxCue, SoundListener } from "../gameSfx.ts";
import { Level6SfxDebugPanel } from "../gameSfxDebug.ts";
import {createCombatSpectatorStage,flyCombatSpectatorCamera,
  focusCombatSpectatorCamera,turnCombatSpectatorCamera} from "./combatSpectatorStage.ts";

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
  /** A LIVE witness never steps the boss; it projects only world-clock frames. */
  private watchingLiveHeroId:string|null=null;
  private requestedReplayId: string | null = null;
  private replayTime = 0;
  private replayFrameIndex = 0;
  private replayFinished = false;
  private forcePreview = false;
  private training: BossTrainingScenario | null = null;
  private modelLab: BossModelLab | null = null;
  private readonly lab:DeveloperCombatLab;
  private readonly labToggle:HTMLButtonElement;
  private readonly modelPanel: HTMLElement;
  private readonly modelToggle: HTMLButtonElement;
  private readonly rendererToggle: HTMLButtonElement;
  private useTripoModel = false;
  private readonly sourceToggle: HTMLButtonElement;
  private motionAccumulator = 0;
  private heroArm: TransformNode | null = null;
  private heroWeapon: TransformNode | null = null;
  private trollVisual: CaveTrollVisual | null = null;
  private projectiles: AbstractMesh[] = [];
  private telegraph: AbstractMesh | null = null;
  private slamTelegraph: AbstractMesh | null = null;
  private impactShockwave: Mesh | null = null;
  private impactDebris: Mesh[] = [];
  private impactFlash: PointLight | null = null;
  private readonly staminaText: HTMLElement;
  private readonly combatInfo: HTMLElement;
  private result: "fighting" | "victory" | "defeat" = "fighting";
  private heroLegs: TransformNode[] = [];
  private readonly panel: HTMLElement;
  private readonly worldHud: BossCombatHud;
  private readonly sfxLab:Level6SfxDebugPanel;
  private readonly status: HTMLElement;
  private readonly focusText: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly bossText: HTMLElement;
  private readonly previewText: HTMLElement;
  private readonly musicToggle: HTMLButtonElement;
  private readonly cinematic: HTMLElement;
  private readonly cinematicLine: HTMLElement;
  private readonly cinematicProgress: HTMLElement;
  private introActive=false;
  private introWallSeconds=0;
  private introSeconds=0;
  private introSfxIndex=0;
  private bossStepDistance=0;
  private heroStepDistance=0;
  private lastBossPhase="chase";
  private lastHeroPhase="move";
  // Pure spectator pose state, not serialized or used by combat collision.
  private gripHandStart:Quaternion|null=null;
  private gripHeroOrientation:Quaternion|null=null;
  private gripApproach:Vector3|null=null;
  private lastHeldRoot:Vector3|null=null;
  private launchVisualRoot:Vector3|null=null;
  private launchMotorRoot:Vector3|null=null;
  private launchVisualRotation:Quaternion|null=null;

  private resetGripPresentation():void {
    this.gripHandStart=null;
    this.gripHeroOrientation=null;
    this.gripApproach=null;
    this.lastHeldRoot=null;
    this.launchVisualRoot=null;
    this.launchMotorRoot=null;
    this.launchVisualRotation=null;
  }

  /** Camera position only affects the audible stereo image, never combat. */
  private soundListener(): SoundListener | undefined {
    return this.camera
      ? { x:this.camera.position.x, z:this.camera.position.z, yaw:this.camera.rotation.y }
      : undefined;
  }

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly shopCamera: UniversalCamera,
    private readonly store: GameStore,
    private readonly onActiveChange: (active: boolean) => void = () => {},
    private readonly bossMusicSeconds:()=>number|null=()=>null,
    private readonly restartBossTheme:()=>void=()=>{},
    private readonly skipBossThemeTo:(seconds:number)=>void=()=>{},
    private readonly sfx?:GameSfx,
  ) {
    this.panel = document.querySelector<HTMLElement>("#arena-hud")!;
    this.worldHud = new BossCombatHud(this.panel,this.canvas,this.engine);
    this.lab=new DeveloperCombatLab(this.engine,this.canvas,this.panel,this.store,this.sfx);
    this.labToggle=document.querySelector<HTMLButtonElement>("#arena-lab-toggle")!;
    this.labToggle.addEventListener("click",()=>this.toggleDeveloperLab());
    document.querySelector<HTMLButtonElement>("#lab-model")!
      .addEventListener("click",()=>this.toggleModelLab());
    this.sfxLab = new Level6SfxDebugPanel(this.sfx);
    this.cinematic=document.querySelector<HTMLElement>("#arena-cinematic")!;
    this.cinematicLine=document.querySelector<HTMLElement>("#arena-cinematic-line")!;
    this.cinematicProgress=document.querySelector<HTMLElement>("#arena-cinematic-progress")!;
    this.status = document.querySelector<HTMLElement>("#arena-status")!;
    this.focusText = document.querySelector<HTMLElement>("#arena-focus")!;
    this.healthText = document.querySelector<HTMLElement>("#arena-hero-health")!;
    this.bossText = document.querySelector<HTMLElement>("#arena-boss-health")!;
    this.previewText = document.querySelector<HTMLElement>("#arena-preview")!;
    this.musicToggle = document.querySelector<HTMLButtonElement>("#music-toggle")!;
    this.staminaText = document.querySelector<HTMLElement>("#arena-stamina")!;
    this.combatInfo = document.querySelector<HTMLElement>("#arena-combat-info")!;
    this.sourceToggle = document.querySelector<HTMLButtonElement>("#arena-source-toggle")!;
    this.modelPanel = document.querySelector<HTMLElement>("#arena-model-panel")!;
    this.modelToggle = document.querySelector<HTMLButtonElement>("#arena-model-toggle")!;
    this.modelToggle.addEventListener("click",()=>this.toggleModelLab());
    this.rendererToggle = document.querySelector<HTMLButtonElement>("#arena-tripo-toggle")!;
    this.rendererToggle.addEventListener("click",()=>{
      if(!this.active || this.modelLab)return;
      this.useTripoModel=!this.useTripoModel;
      this.restart(true); // Same fighter/training scenario; restart only the spectator presentation.
    });
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
      if(this.modelLab){
        if(event.code==="Escape"||event.code==="KeyV"){
          event.preventDefault();event.stopImmediatePropagation();
          if(event.code==="Escape")this.toggleModelLab();
          else this.close();
        }
        return;
      }
      if (event.target instanceof Element &&
        event.target.closest("#music-panel, #arena-sfx-debug, #arena-sfx-debug-toggle, #arena-lab-panel")) return;
      if(this.lab.isActive){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(event.repeat)return;
        if(event.code==="KeyV"||event.code==="Escape")this.close();
        else if(event.code==="Space"||event.code==="Enter")this.lab.skipIntro();
        else if(event.code==="Tab")this.lab.nextFocus();
        else if(event.code==="KeyM")this.musicToggle.focus();
        else this.pressed.add(event.code);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if(this.introActive&&(event.code==="Space"||event.code==="Enter")){
        this.finishCinematic(true);
        return;
      }
      if(event.code==="Escape"||event.code==="KeyV")this.close();
      else if(event.code==="KeyM")this.musicToggle.focus();
      else if(event.code==="KeyC"&&!this.sourceToggle.hidden)this.toggleSource();
      else if(this.introActive)return; // The audience cannot interrupt the filmed camera.
      else if(event.code==="Tab")this.nextFocus();
      else this.pressed.add(event.code);
    }, true);
    window.addEventListener("keyup", (event) => {
      if (!this.active || this.modelLab) return;
      if (event.target instanceof Element &&
        event.target.closest("#music-panel, #arena-sfx-debug, #arena-sfx-debug-toggle, #arena-lab-panel")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pressed.delete(event.code);
    }, true);
    window.addEventListener("blur", () => this.pressed.clear());
    canvas.addEventListener("pointerdown", (event) => {
      if (!this.active || this.modelLab) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(this.lab.isActive?this.lab.isIntroActive:this.introActive)return;
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    }, true);
    document.addEventListener("mousemove", (event) => {
      if (!this.active || this.modelLab || this.introActive ||
          document.pointerLockElement !== canvas) return;
      if(this.lab.isActive){this.lab.turnCamera(event.movementX,event.movementY);return;}
      if(this.camera)turnCombatSpectatorCamera(this.camera,event.movementX,event.movementY);
    }, true);
  }

  get currentScene(): Scene | null { return this.active ?
    (this.modelLab?.scene ?? this.lab.currentScene ?? this.scene) : null; }
  get isActive(): boolean { return this.active; }
  /** Allow the live world, including physical shop visitors, to advance. */
  get isWatchingLiveBoss():boolean {
    return this.active&&this.watchingLiveHeroId!==null;
  }

  /** Public roster entry for the one real running Level-6 fight. */
  openLiveBoss(heroId:string):boolean{
    const boss=this.store.state.liveDungeon.bossCombat;
    if(!boss||boss.heroId!==heroId||this.active)return false;
    this.watchingLiveHeroId=heroId;
    // LIVE boss always prefers the actual Tripo 14-clip cinematic actor,
    // never the training-only legacy geometric stand-in.
    this.useTripoModel=true;
    this.open();
    return this.active;
  }

  private toggleDeveloperLab():void{
    if(!this.active||this.modelLab)return;
    if(this.lab.isActive){
      this.lab.close();
      this.panel.dataset.devLab="false";
      this.labToggle.textContent="Developer Combat Lab";
      this.restart();
      return;
    }
    this.watchingLiveHeroId=null; // Sandbox must pause the REAL world again.
    this.sfx?.endArena();
    this.sfxLab.setAvailable(false);
    this.worldHud.reset();
    this.scene?.dispose();
    this.scene=null;
    this.motion=null;
    this.replay=null;
    this.introActive=false;
    this.cinematic.hidden=true;
    this.panel.dataset.intro="false";
    this.sourceToggle.hidden=true;
    if(document.pointerLockElement)void document.exitPointerLock();
    this.lab.open();
    // The shared SFX workbench belongs in the actual Combat Lab too, not
    // only in the historical solo preview.
    this.sfxLab.setAvailable(true);
    this.panel.dataset.devLab="true";
    this.labToggle.textContent="Return to Level 6 preview";
    this.previewText.textContent=
      "DEVELOPER COMBAT LAB · Real 60Hz test simulation, no campaign writes.";
    this.status.textContent="Independent combat balance test";
  }

  private toggleSource(): void {
    if(this.modelLab)return;
    this.watchingLiveHeroId=null;
    this.forcePreview = !this.forcePreview;
    this.restart();
  }

  private toggleModelLab():void {
    if(!this.active)return;
    if(this.modelLab){
      this.modelLab.dispose();
      this.modelLab=null;
      this.modelPanel.hidden=true;
      this.panel.dataset.modelViewer="false";
      this.modelToggle.textContent="Inspect Tripo GLB";
      this.restart(); // reset presentation, preserve recorded source unchanged
      return;
    }
    if(document.pointerLockElement)void document.exitPointerLock();
    this.introActive=false;
    this.cinematic.hidden=true;
    this.panel.dataset.intro="false";
    this.sfx?.endArena();
    this.sfxLab.setAvailable(false);
    this.worldHud.reset();
    this.pressed.clear();
    this.modelPanel.hidden=false;
    this.panel.dataset.modelViewer="true";
    this.modelToggle.textContent="Return to battle";
    this.modelLab=new BossModelLab(this.engine,this.canvas,this.modelPanel);
  }

  open(eventId?: string): void {
    if (this.active || document.querySelector("dialog[open]") ||
      document.body.classList.contains("dungeon-active")) return;
    if(eventId)this.watchingLiveHeroId=null;
    this.requestedReplayId=eventId??null;
    this.modelPanel.hidden=true;
    this.panel.dataset.modelViewer="false";
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.onActiveChange(true);
    // V always opens a fresh practice duel. Explicit ledger footage opens
    // the immutable saved recording; the C control switches either way.
    this.forcePreview = !eventId;
    this.pressed.clear();
    this.panel.hidden = false;
    document.body.classList.add("arena-active");
    this.restart();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.lab.close();
    this.panel.dataset.devLab="false";
    this.labToggle.textContent="Developer Combat Lab";
    this.modelLab?.dispose();
    this.modelLab=null;
    this.modelPanel.hidden=true;
    this.panel.dataset.modelViewer="false";
    this.modelToggle.textContent="Inspect Tripo GLB";
    this.introActive=false;
    this.sfx?.endArena();
    this.sfxLab.setAvailable(false);
    this.worldHud.reset();
    this.cinematic.hidden=true;
    this.panel.dataset.intro="false";
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
    this.resetGripPresentation();
    this.motion = null;
    this.replay = null;
    this.requestedReplayId=null;
    this.watchingLiveHeroId=null;
    this.projectiles = [];
    this.telegraph = null;
    this.slamTelegraph = null;
    this.impactShockwave = null;
    this.impactDebris = [];
    this.impactFlash = null;
    this.heroArm = null;
    this.heroWeapon = null;
    this.trollVisual = null;
    this.shopCamera.attachControl(this.canvas, true);
    this.canvas.focus();
  }

  restart(preserveTraining = false): void {
    if (!this.active || this.modelLab) return;
    if(this.lab.isActive){this.lab.restart();return;}
    const previousTraining = this.training;
    this.panel.dataset.bossRenderer=this.useTripoModel?"tripo":"legacy";
    this.rendererToggle.textContent=this.useTripoModel?"Tripo loading… · switch to legacy":"Legacy boss · try Tripo";
    this.sfx?.endArena();
    this.scene?.dispose();
    this.worldHud.reset();
    this.heroLegs = [];
    this.trollVisual = null;
    this.targets = [];
    this.projectiles = [];
    this.telegraph = null;
    this.slamTelegraph = null;
    this.impactShockwave = null;
    this.impactDebris = [];
    this.impactFlash = null;
    this.heroArm = null;
    this.heroWeapon = null;
    this.motionAccumulator = 0;
    this.replayTime = 0;
    this.replayFrameIndex = 0;
    this.replayFinished = false;
    this.introActive=false;
    this.introWallSeconds=0;
    this.introSeconds=0;
    this.introSfxIndex=0;
    this.bossStepDistance=0;
    this.heroStepDistance=0;
    this.lastBossPhase="chase";
    this.lastHeroPhase="move";
    this.resetGripPresentation();
    this.result = "fighting";
    const state = this.store.state;
    const recorded = [...state.events].reverse()
      .find(event => event.type === "level6-combat" && event.combatReplay &&
        (!this.requestedReplayId || event.id===this.requestedReplayId));
    const saved=recorded?.combatReplay??null;
    const live=this.watchingLiveHeroId?
      state.liveDungeon.bossCombat?.heroId===this.watchingLiveHeroId
        ?state.liveDungeon.bossCombat:null:null;
    this.replay=live?{
      version:1,day:state.day,heroId:live.heroId,
      role:live.state.options.role,sword:live.state.options.sword,
      armor:live.state.options.armor,maxHp:live.state.options.maxHealth,
      outcome:"retreat",frames:live.frames,
    }:this.forcePreview?null:saved;
    if(this.replay&&recorded&&!live)observeReplay(recorded.id);
    this.sourceToggle.hidden = !saved||!!live;
    this.sourceToggle.textContent = this.replay ? "Preview current expedition" : "Watch last saved combat";
    this.panel.dataset.replay = live?"live":this.replay?"recorded":"preview";
    this.sfxLab.setAvailable(!this.replay);
    this.fighter = this.replay
      ? state.adventurers.find(hero => hero.id === this.replay!.heroId) ?? null
      : state.adventurers.find(hero => hero.status === "expedition") ?? null;
    const realExpedition = !this.replay && this.fighter?.status === "expedition";
    // Presentation-only sparring partner: never enters GameStore or replays.
    this.training = !this.replay && !realExpedition
      ? (preserveTraining && previousTraining ? previousTraining : nextBossTrainingScenario()) : null;
    this.panel.dataset.trainingScenario=this.training?.id??"";
    this.motion = createCombatPreview({
      role: this.replay?.role ?? this.training?.options.role ?? this.fighter?.role ?? "tank",
      sword: this.replay?.sword ?? this.training?.options.sword ??
        (this.fighter?.equipment.weapon === "Iron Sword"),
      armor: this.replay?.armor ?? this.training?.options.armor ??
        (this.fighter?.equipment.armor === "Leather Vest"),
      health: this.replay?.frames[0].heroHp ?? this.training?.options.health ??
        this.fighter?.health ?? 45,
      maxHealth: this.replay?.maxHp ?? this.training?.options.maxHealth ??
        this.fighter?.stats.maxHealth ?? 50,
      healingSupplies: this.training?.options.healingSupplies ?? this.fighter?.inventory.healing ?? 0,
      strength: this.training?.options.strength,
      agility: this.training?.options.agility,
      intellect: this.training?.options.intellect,
      tacticsSeed: this.training?.options.tacticsSeed,
    });
    if (this.replay) this.applyReplayFrame(this.replay.frames[0]);
    const names = heroDisplayNames(state.adventurers);
    this.previewText.textContent = live
      ?"LIVE BOSS · Shared world-clock combat · Read-only witness, no reroll or pause."
      :this.replay
      ? "RECORDED COMBAT · Day " + this.replay.day + " · " + this.replay.outcome +
        " · Exact saved fight, no additional damage or rewards."
      : realExpedition
        ? "EXPEDITION PREVIEW · Uncommitted training only. Confirm the day to record the real fight."
        : "TRAINING PREVIEW · " + this.training?.label +
          " · New sparring match each restart. No saved gameplay changes.";
    // Level-6 authored lighting and spectator camera are THE shared standard.
    // The Crypt variant uses this same stage, not a competing arena engine.
    const {scene,camera}=createCombatSpectatorStage(this.engine,"cave-troll");
    this.scene=scene;
    this.camera=camera;
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
    const visibleRole = this.replay?.role ?? this.training?.options.role ?? this.fighter?.role;
    const visibleSword = this.replay?.sword ?? this.training?.options.sword ??
      (this.fighter?.equipment.weapon === "Iron Sword");
    const visibleArmor = this.replay?.armor ?? this.training?.options.armor ??
      (this.fighter?.equipment.armor === "Leather Vest");
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
    // Reusable, scene-owned rock shards. They sample the authoritative boss
    // phase/age each frame; no spawned-per-frame objects or extra hit events.
    const rubbleMat=makeMat("mauler-impact-rubble","#6c625c");
    const hotRubbleMat=makeMat("mauler-impact-rubble-hot","#ae8470");
    for(let i=0;i<16;i++){
      const shard=MeshBuilder.CreateSphere("mauler-impact-debris-"+i,{
        diameter:.17+(i%4)*.075,segments:5,
      },scene);
      shard.material=i%5===0?hotRubbleMat:rubbleMat;
      shard.visibility=0;
      shard.isPickable=false;
      shard.checkCollisions=false;
      this.impactDebris.push(shard);
    }
    this.impactFlash=new PointLight("mauler-impact-flash",
      new Vector3(0,1.2,0),scene);
    this.impactFlash.diffuse=Color3.FromHexString("#edab75");
    this.impactFlash.range=12;
    this.impactFlash.intensity=0;
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
    this.trollVisual = this.useTripoModel
      ? createTripoCaveTrollVisual(scene) : createCaveTrollVisual(scene);
    const visual=this.trollVisual;
    if(this.useTripoModel) void visual.ready.then(()=>{
      if(this.trollVisual!==visual || !this.active)return;
      const status=visual.root.metadata?.tripoStatus;
      this.rendererToggle.textContent=status==="ready"
        ?"Tripo trial active · switch to legacy"
        :"Tripo unavailable · legacy fallback";
      this.rendererToggle.title=status==="fallback"
        ?String(visual.root.metadata?.tripoError??"Tripo import failed"):"Experimental skinned 3D model";
    });
    const boss = this.trollVisual.root;
    // The sculpt's face points along local +Z. The hero initially stands
    // at -Z, so orient the boss to the authoritative combat heading before
    // the first cinematic frame. paintCombat() already applies this heading
    // after the intro; previously the unrotated intro showed his back.
    boss.position.set(this.motion.boss.x,0,this.motion.boss.z);
    boss.rotation.y = this.motion.bossHeading;
    this.trollVisual.animate({
      phase:"chase",phaseAge:0,slam:false,time:0,moved:0,
      delta:0,hp:BOSS_HP,maxHp:BOSS_HP,
    });
    // v1 recorded duels can begin at 145 HP even after a future balance
    // change increases the health of *newly simulated* trolls. Never
    // relabel or resimulate their original stored health scale.
    const recordedBossMax=this.replay?.frames[0]?.bossHp??BOSS_HP;
    this.boss = {root:boss,hp:recordedBossMax,max:recordedBossMax,alive:true};

    // The same geometry/identity factory is used by shop NPCs and future dungeons.
    // Recorded battles use their own historical gear snapshot, not today's gear.
    const heroId = this.replay?.heroId ?? this.training?.id ?? this.fighter?.id ?? "preview";
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
    const displayName = this.training?.label ?? (this.fighter ? names.get(this.fighter.id) ?? this.fighter.name : "Preview Hero");
    this.targets = [
      { label: displayName + " · " + (visibleRole ?? "tank"), node: hero,
        vantage: new Vector3(4, 5, -8) },
      { label: "THE CAVE TROLL · BOSS", node: boss, vantage: new Vector3(5.5, 5.3, -7.0) },
    ];
    this.focusIndex = 0;
    this.focusCamera();
    this.status.textContent = this.replay
      ? "Recorded fight ready. The same committed actions will play back."
      : "The Cave Troll is guarding Level 6.";
    this.updateHud();
    this.startCinematic();
  }

  private nextFocus(): void {
    if (!this.targets.length) return;
    this.focusIndex = (this.focusIndex + 1) % this.targets.length;
    this.focusCamera();
  }

  private focusCamera(): void {
    const target = this.targets[this.focusIndex];
    if (!target || !this.camera) return;
    const view = this.focusIndex === 0 && this.boss && this.hero
      ? Vector3.Lerp(this.hero.root.position, this.boss.root.position, .53)
        .addInPlace(new Vector3(0,3.2,0))
      : target.node.position.add(new Vector3(0,4.1,0));
    focusCombatSpectatorCamera(this.camera,target.node.position,target.vantage,view);
    this.focusText.textContent = "TAB focus: " + target.label;
  }

  /** Each restart (including saved replay switches) restarts the soundtrack
   * and samples a read-only 13.5-second cinematic before advancing one tick. */
  private startCinematic():void {
    this.introActive=true;
    this.introSeconds=0;
    this.introWallSeconds=0;
    this.pressed.clear();
    this.panel.dataset.intro="true";
    this.panel.dataset.introSeconds="0";
    this.cinematic.hidden=false;
    this.restartBossTheme();
    this.sfx?.beginArena();
    this.paintCinematic(0,0);
  }

  private paintCinematic(seconds:number,dt:number):void {
    if(!this.camera)return;
    const view=sampleBossIntro(seconds);
    this.camera.position.set(...view.eye);
    this.camera.setTarget(new Vector3(...view.look));
    this.cinematicLine.textContent=view.caption;
    this.cinematicProgress.style.width=Math.round(view.progress*100)+"%";
    this.panel.dataset.introSeconds=view.time.toFixed(2);
    // Breathe/brace in front of the player, but never touch combat or replay.
    this.trollVisual?.animate({
      phase:"chase",phaseAge:0,slam:false,time:seconds,moved:0,
      delta:dt,hp:this.boss?.hp??BOSS_HP,
      maxHp:this.boss?.max??BOSS_HP,introTime:seconds,
    });
  }

  private finishCinematic(skipped:boolean):void {
    if(!this.introActive)return;
    this.introActive=false;
    this.panel.dataset.intro="false";
    this.panel.dataset.introSeconds=BOSS_INTRO_SECONDS.toFixed(2);
    this.cinematic.hidden=true;
    if(skipped)this.skipBossThemeTo(BOSS_INTRO_SECONDS);
    this.pressed.clear();
    this.focusCamera();
    if(this.watchingLiveHeroId&&this.replay){
      // The world advanced during the cinematic. Jump ONLY the spectator
      // cursor near the last already committed frame, never world time.
      const committed=this.store.state.liveDungeon.bossCombat;
      if(committed?.heroId===this.watchingLiveHeroId)
        this.replay={...this.replay,frames:committed.frames};
      this.replayTime=Math.max(0,this.replay.frames.at(-1)!.t-.5);
      let frameIndex=0;
      for(let i=1;i<this.replay.frames.length;i++)
        if(this.replay.frames[i].t<=this.replayTime)frameIndex=i;
      this.replayFrameIndex=frameIndex;
    }
    this.status.textContent=this.replay
      ?"Recorded combat · original saved frames, no new damage or rewards."
      :"The Ashen Tunnel Mauler is attacking · training only.";
    this.paintCombat(0);
  }

  private updateCinematic(dt:number):void {
    this.introWallSeconds+=dt;
    const audioSeconds=this.bossMusicSeconds();
    this.introSeconds=audioSeconds===null
      ?this.introWallSeconds:Math.max(0,audioSeconds);
    // Browser audio stalls, muted tabs and failed autoplay must not softlock
    // the replay. Use the visual wall clock after a modest grace period.
    if(this.introWallSeconds>BOSS_INTRO_SECONDS+4)
      this.introSeconds=Math.max(this.introSeconds,BOSS_INTRO_SECONDS);
    if(this.introSeconds>=BOSS_INTRO_SECONDS){
      this.finishCinematic(false);
      return;
    }
    // Score-led foley landmarks; skipping the film never fires queued sounds.
    const introSounds:readonly {at:number;id:GameSfxCue}[]=[
      {at:1.8,id:"troll-breath"},
      {at:5.9,id:"troll-roar"},
      {at:11.2,id:"troll-breath"},
    ];
    while(this.introSfxIndex<introSounds.length &&
      this.introSeconds>=introSounds[this.introSfxIndex].at){
      const entry=introSounds[this.introSfxIndex++];
      this.sfx?.play(entry.id,this.motion?.boss,this.soundListener());
    }
    this.paintCinematic(this.introSeconds,dt);
  }

  /** Preview combat advances at a fixed 60 Hz independent of render FPS. */
  update(deltaSeconds: number): void {
    if (this.modelLab)return;
    if(this.lab.isActive){this.lab.update(deltaSeconds,this.pressed);return;}
    if (!this.active || !this.scene || !this.camera || !this.hero || !this.boss || !this.motion) return;
    const frameDt = Math.min(0.1, Math.max(0, deltaSeconds));
    if(this.introActive){
      this.updateCinematic(frameDt);
      return;
    }
    flyCombatSpectatorCamera(this.camera,this.pressed,frameDt);

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
    state.bossAttack = frame.attack==="grab" ? "grab" : frame.slam ? "slam" : "smash";
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
    let replay=this.replay;
    if(this.watchingLiveHeroId){
      const active=this.store.state.liveDungeon.bossCombat;
      if(active?.heroId===this.watchingLiveHeroId&&replay){
        // Refreshed LIVE frames come only from committed world-time updates.
        // No hero AI, boss damage or RNG runs in the spectator.
        replay={...replay,frames:active.frames};
        this.replay=replay;
      }else if(!active){
        const completed=[...this.store.state.events].reverse().find(event=>
          event.type==="level6-combat"&&
          event.adventurerId===this.watchingLiveHeroId&&
          event.combatReplay);
        if(completed?.combatReplay){
          replay=completed.combatReplay;
          this.replay=replay;
        }
      }
    }
    if (!replay || !this.motion) return;
    const frames = replay.frames;
    const end = frames[frames.length-1].t;
    this.replayTime = Math.min(end, this.replayTime + dt);
    while (this.replayFrameIndex + 1 < frames.length &&
      frames[this.replayFrameIndex+1].t <= this.replayTime) {
      this.replayFrameIndex++;
      for (const cue of frames[this.replayFrameIndex].cues)
        this.displayCue(cue,frames[this.replayFrameIndex]);
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
    const stillLive=!!(this.watchingLiveHeroId&&
      this.store.state.liveDungeon.bossCombat?.heroId===this.watchingLiveHeroId);
    if(stillLive&&this.replayTime>=end){
      this.motion.outcome="fighting";
      this.status.textContent="LIVE · Waiting for the next committed world-clock frame.";
    }else if (this.replayTime >= end && !this.replayFinished) {
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

  private displayCue(cue: ArenaCue, frame?: BossReplayFrame): void {
    const value = cue.amount === undefined ? "" : " (" + cue.amount + " HP)";
    const messages: Record<ArenaCue["kind"], string> = {
      windup: (frame?.attack==="grab" || (!frame && this.motion?.bossAttack==="grab"))
        ? "GRAB WARNING · The Troll is reaching for the hero!"
        : "TROLL WINDUP · Dodge the glowing attack lane!",
      dodge: "DODGED · Hit avoided during real invulnerability frames.",
      parry: "PARRY! A timed, facing block staggered the Cave Troll.",
      miss: "MISSED · Target escaped the attack lane or grip.",
      grab: "GRABBED! · The Cave Troll has caught the hero.",
      throw: "THROWN! · The hero is flying toward the arena edge.",
      hit: "TROLL HIT" + value + " · The strike made contact.",
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
    if(this.motion){
      // Replay audio uses the actual saved cue frame for origin/phase, not
      // the previous frame which has not yet been applied for presentation.
      const hero=frame?{x:frame.hx,z:frame.hz}:this.motion.hero;
      const boss=frame?{x:frame.bx,z:frame.bz}:this.motion.boss;
      const bossPhase=frame?.bossPhase??this.motion.bossPhase;
      this.sfx?.playCombatCue(cue,hero,boss,this.soundListener(),
        bossPhase==="strike" || (frame?.attack??this.motion.bossAttack)==="grab",
        frame?.slam??this.motion.bossSlam,
        cue.kind==="miss" &&
          (frame?.attack??this.motion.bossAttack)==="grab");
      this.worldHud.pushCue(cue,this.motion);
    }
  }

  private paintCombat(frameDt: number): void {
    const state = this.motion;
    if (!state || !this.hero || !this.boss || !this.scene) return;
    const hero = this.hero, boss = this.boss;
    const oldHeroX = hero.root.position.x, oldHeroZ = hero.root.position.z;
    const oldBossX = boss.root.position.x, oldBossZ = boss.root.position.z;
    // Start with authoritative ground-space coordinates. The real skinned
    // finger pose is sampled later, AFTER the GLB pose has advanced.
    const throwProgress=Math.max(0,
      Math.min(1,state.heroAge/GRAPPLE_TIMING.flight));
    hero.root.position.set(state.hero.x,0,state.hero.z);
    boss.root.position.set(state.boss.x, 0, state.boss.z);
    hero.root.rotation.y = state.heroHeading;
    boss.root.rotation.y = state.bossHeading;
    hero.hp = state.heroHp;
    boss.hp = state.bossHp;
    hero.alive = state.outcome !== "defeat";
    boss.alive = state.outcome !== "victory";

    const movedHero = Math.hypot(state.hero.x - oldHeroX, state.hero.z - oldHeroZ);
    const movedBoss = Math.hypot(state.boss.x - oldBossX, state.boss.z - oldBossZ);
    const listener=this.soundListener();
    // Footsteps follow visible travel, not a guessed timer or modified AI.
    // Ignore initial teleports/replay seeks and avoid bursts on slow frames.
    if(state.bossPhase==="chase" && movedBoss>.004 && movedBoss<.65){
      this.bossStepDistance+=movedBoss;
      if(this.bossStepDistance>=1.45){
        this.bossStepDistance%=1.45;
        this.sfx?.play("troll-step",state.boss,listener);
      }
    }else if(state.bossPhase!=="chase")this.bossStepDistance=0;
    if(state.heroPhase==="move" && movedHero>.004 && movedHero<.65){
      this.heroStepDistance+=movedHero;
      if(this.heroStepDistance>=.88){
        this.heroStepDistance%=.88;
        this.sfx?.play("hero-step",state.hero,listener);
      }
    }else if(state.heroPhase!=="move")this.heroStepDistance=0;
    // Swings sound on the start of the actual animated strike, impacts on
    // authoritative hit/miss/parry cues. A windup alone is not a hit.
    if(state.bossPhase==="strike" && this.lastBossPhase!=="strike")
      this.sfx?.play("troll-swing",state.boss,listener,false,state.bossSlam);
    if(state.heroPhase==="attack" && this.lastHeroPhase!=="attack")
      this.sfx?.play("hero-attack",state.hero,listener);
    this.lastBossPhase=state.bossPhase;
    this.lastHeroPhase=state.heroPhase;
    for (const [index, leg] of this.heroLegs.entries()) {
      leg.rotation.x = movedHero > 0.005 && state.heroPhase === "move"
        ? Math.sin(state.time * 12 + index * Math.PI) * 0.50 : 0;
    }
    this.trollVisual?.animate({
      phase: state.bossPhase,
      phaseAge: state.bossAge,
      slam: state.bossSlam,
      attackType: state.bossAttack,
      time: state.time,
      moved: movedBoss,
      delta: frameDt,
      hp: state.bossHp,
      maxHp: boss.max,
    });
    // Grip follows the actual animated LeftHand/Index/Middle/Thumb bones.
    // When the authoritative "throw" cue releases the victim, detach from
    // the last real socket and blend to the MOTOR's actual landing point.
    // The animation never controls game coordinates or causes extra hits.
    const gripping = state.heroPhase==="grabbed";
    const realGrip = gripping ? this.trollVisual?.gripPose?.() : null;
    if (gripping && realGrip) {
      if (!this.gripHandStart) {
        this.gripHandStart=realGrip.handRotation.clone();
        this.gripHeroOrientation=Quaternion.RotationYawPitchRoll(
          state.heroHeading,0,-.38);
        this.gripApproach=new Vector3(state.hero.x,0,state.hero.z);
      }
      const handDelta=realGrip.handRotation.multiply(
        Quaternion.Inverse(this.gripHandStart));
      const orientation=handDelta.multiply(this.gripHeroOrientation!);
      hero.root.rotationQuaternion=orientation;
      const torsoRotation=Matrix.Identity();
      Matrix.FromQuaternionToRef(orientation,torsoRotation);
      const torsoOffset=Vector3.TransformNormal(
        new Vector3(0,1.14*hero.root.scaling.y,0),torsoRotation);
      const socketRoot=realGrip.position.subtract(torsoOffset);
      const catchProgress=Math.max(0,Math.min(1,state.heroAge/.16));
      const eased=catchProgress*catchProgress*(3-2*catchProgress);
      hero.root.position.copyFrom(Vector3.Lerp(
        this.gripApproach!,socketRoot,eased));
      this.lastHeldRoot=hero.root.position.clone();
      hero.root.metadata.gripAttached=catchProgress>=1;
      hero.root.metadata.gripJoint="mixamorig:LeftHand";
      // Recheck actual model-space torso, not the floating character root.
      const torsoWorld=hero.root.position.add(torsoOffset);
      hero.root.metadata.gripTorsoError=Vector3.Distance(
        torsoWorld,realGrip.position);
    } else if (gripping) {
      // Legacy renderer has no finger bones. Never fake a skinned binding.
      hero.root.rotationQuaternion=null;
      hero.root.position.y=2.45;
      this.lastHeldRoot=hero.root.position.clone();
      hero.root.metadata.gripAttached=false;
      hero.root.metadata.gripJoint=null;
      hero.root.metadata.gripTorsoError=null;
    } else if (state.heroPhase==="thrown") {
      if (!this.launchVisualRoot) {
        this.launchVisualRoot=this.lastHeldRoot?.clone() ??
          new Vector3(state.hero.x,2.45,state.hero.z);
        this.launchMotorRoot=new Vector3(state.hero.x,0,state.hero.z);
        this.launchVisualRotation=hero.root.rotationQuaternion?.clone() ??
          Quaternion.RotationYawPitchRoll(state.heroHeading,0,-.38);
      }
      hero.root.position.copyFrom(airborneRootFromGrip(
        this.launchVisualRoot,this.launchMotorRoot!,
        new Vector3(state.hero.x,0,state.hero.z),throwProgress));
      const tumble=Quaternion.RotationYawPitchRoll(
        state.heroHeading,-.35*Math.sin(Math.PI*throwProgress),
        2*Math.PI*throwProgress);
      hero.root.rotationQuaternion=Quaternion.Slerp(
        this.launchVisualRotation!,tumble,Math.min(1,throwProgress/.18));
      hero.root.metadata.gripAttached=false;
      hero.root.metadata.gripJoint=null;
      hero.root.metadata.gripTorsoError=null;
    } else {
      this.resetGripPresentation();
      hero.root.rotationQuaternion=null;
      hero.root.metadata.gripAttached=false;
      hero.root.metadata.gripJoint=null;
      hero.root.metadata.gripTorsoError=null;
    }

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
    if (state.heroPhase==="grabbed" && realGrip) {
      // Quaternion above owns the entire orientation, including wrist twist.
    } else if (state.heroPhase==="thrown") {
      // Flight blends from the last hand orientation toward a full tumble.
    } else if (state.heroPhase === "grabbed") {
      hero.root.rotation.z = -.38;
      hero.root.rotation.x = 0;
    } else if (state.heroPhase === "roll") {
      hero.root.rotation.z = Math.sin(Math.min(1, state.heroAge / 0.53) * Math.PI) * 1.0;
      hero.root.rotation.x = Math.PI * 2 * Math.min(1, state.heroAge / 0.53);
    } else {
      hero.root.rotation.x = 0;
      hero.root.rotation.z = state.outcome === "defeat" ? Math.PI / 2
        : state.heroPhase === "hurt" ? -0.25 : 0;
    }
    // The impact happens at the actual 140ms hit tick and persists through
    // recover. All effects follow source frames in both preview and replay.
    // They never affect attacks, damage, navigation or stored outcomes.
    const fx=state.bossAttack==="grab"
      ? sampleMaulerImpact(state.bossPhase==="windup"?"windup":"chase",
          state.bossAge,false)
      : sampleMaulerImpact(state.bossPhase,state.bossAge,state.bossSlam);
    const hammerReach=state.bossSlam?3.45:2.75;
    const impactX=state.boss.x+Math.sin(state.lockedBossHeading)*hammerReach;
    const impactZ=state.boss.z+Math.cos(state.lockedBossHeading)*hammerReach;
    if(this.impactShockwave){
      this.impactShockwave.visibility=fx.impact;
      this.impactShockwave.scaling.setAll(fx.ringScale);
      this.impactShockwave.position.set(impactX,.14,impactZ);
    }
    for(let i=0;i<this.impactDebris.length;i++){
      const shard=this.impactDebris[i];
      const angle=i*2.399963229728653+(i%3)*.17;
      const radius=fx.debrisSpread*(.41+(i%5)*.15);
      shard.visibility=fx.impact>0.02?Math.min(.95,fx.impact*1.65):0;
      shard.position.set(
        impactX+Math.cos(angle)*radius,
        .14+fx.debrisRise*(.52+(i%4)*.17),
        impactZ+Math.sin(angle)*radius,
      );
      shard.rotation.set(angle*.25,angle+fx.debrisSpread*.28,
        angle*.18+fx.debrisSpread*.35);
    }
    if(this.impactFlash){
      this.impactFlash.position.set(impactX,1.1,impactZ);
      this.impactFlash.intensity=fx.flash;
    }
    for (const [telegraph, slam] of [[this.telegraph, false], [this.slamTelegraph, true]] as const) {
      if (!telegraph) continue;
      telegraph.visibility = state.bossSlam === slam ? fx.telegraph : 0;
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
    boss.root.metadata.combatAttack = state.bossAttack;
    boss.root.metadata.previewHp = state.bossHp;
    boss.root.metadata.missedHits = state.missedHits;
    boss.root.metadata.dodgeCount = state.dodgeCount;
    boss.root.metadata.parryCount = state.parryCount;
    this.result = state.outcome;
    this.updateHud();
    this.worldHud.render(this.scene,state,frameDt,boss.max,
      hero.root.position.clone());
  }

  private updateHud(): void {
    if (!this.hero || !this.boss) return;
    this.healthText.textContent = "HERO HP " + this.hero.hp + "/" + this.hero.max;
    this.bossText.textContent = "CAVE TROLL HP " + this.boss.hp + "/" + this.boss.max;
    if (this.motion) {
      this.staminaText.textContent = "STAMINA " + Math.round(this.motion.stamina) + "/100";
      this.combatInfo.textContent = "Hero: " + this.motion.heroPhase +
        " · Troll: " + this.motion.bossPhase +
        " (" + this.motion.bossAttack + ")" +
        " · Dodges " + this.motion.dodgeCount + " · Parries " + this.motion.parryCount +
        " · Connected hits " + this.motion.landedHits;
    }
    this.panel.dataset.result = this.replay?.outcome ??
      (this.result === "defeat" ? "death" : this.result);
  }
}
