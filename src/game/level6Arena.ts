import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  BOSS_MAX_HP, createCombatPreview, stepCombatPreview,
  type CombatPreviewState, type ArenaCue,
} from "./arenaCombatMotion.ts";
import type { AdventurerState } from "./adventurers.ts";
import type { GameStore } from "./gameStore.ts";
import { heroDisplayNames } from "./heroIdentity.ts";

type Fighter = { root: TransformNode; hp: number; max: number; alive: boolean };
type FocusTarget = { label: string; node: TransformNode; vantage: Vector3 };
const ROCK_RADIUS = 17.5;
const BOSS_HP = BOSS_MAX_HP;

/** A non-authoritative combat demonstration. Never writes to GameStore.
 * A later milestone will animate the actual deterministic combat transcript.
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
  private motionAccumulator = 0;
  private heroWeapon: TransformNode | null = null;
  private trollLegs: TransformNode[] = [];
  private projectiles: AbstractMesh[] = [];
  private telegraph: AbstractMesh | null = null;
  private readonly staminaText: HTMLElement;
  private readonly combatInfo: HTMLElement;
  private result: "fighting" | "victory" | "defeat" = "fighting";
  private swing: TransformNode | null = null;
  private heroLegs: TransformNode[] = [];
  private readonly panel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly focusText: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly bossText: HTMLElement;
  private readonly previewText: HTMLElement;

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly shopCamera: UniversalCamera,
    private readonly store: GameStore,
  ) {
    this.panel = document.querySelector<HTMLElement>("#arena-hud")!;
    this.status = document.querySelector<HTMLElement>("#arena-status")!;
    this.focusText = document.querySelector<HTMLElement>("#arena-focus")!;
    this.healthText = document.querySelector<HTMLElement>("#arena-hero-health")!;
    this.bossText = document.querySelector<HTMLElement>("#arena-boss-health")!;
    this.previewText = document.querySelector<HTMLElement>("#arena-preview")!;
    this.staminaText = document.querySelector<HTMLElement>("#arena-stamina")!;
    this.combatInfo = document.querySelector<HTMLElement>("#arena-combat-info")!;
    document.querySelector("#open-arena")!.addEventListener("click", () => this.open());
    document.querySelector("#close-arena")!.addEventListener("click", () => this.close());
    document.querySelector("#restart-arena")!.addEventListener("click", () => this.restart());
    // Capture input before the shop's old listeners. Spectating never interacts,
    // spends money, confirms End Day, or changes the shop player's movement.
    window.addEventListener("keydown", (event) => {
      if (!this.active) {
        if (event.code === "KeyV" && !event.repeat && !document.querySelector("dialog[open]")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape" || event.code === "KeyV") this.close();
      else if (event.code === "Tab") this.nextFocus();
      else this.pressed.add(event.code);
    }, true);
    window.addEventListener("keyup", (event) => {
      if (!this.active) return;
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

  open(): void {
    if (this.active || document.querySelector("dialog[open]")) return;
    this.shopCamera.detachControl();
    if (document.pointerLockElement) void document.exitPointerLock();
    this.active = true;
    this.pressed.clear();
    this.panel.hidden = false;
    document.body.classList.add("arena-active");
    this.restart();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
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
    this.projectiles = [];
    this.telegraph = null;
    this.heroWeapon = null;
    this.shopCamera.attachControl(this.canvas, true);
    this.canvas.focus();
  }

  restart(): void {
    if (!this.active) return;
    this.scene?.dispose();
    this.heroLegs = [];
    this.trollLegs = [];
    this.targets = [];
    this.projectiles = [];
    this.telegraph = null;
    this.heroWeapon = null;
    this.motionAccumulator = 0;
    this.result = "fighting";
    const state = this.store.state;
    this.fighter = state.adventurers.find(hero => hero.status === "expedition") ??
      state.adventurers.find(hero => hero.status === "at-shop") ??
      state.adventurers.find(hero => hero.status !== "dead") ?? null;
    this.motion = createCombatPreview({
      role: this.fighter?.role ?? "tank",
      sword: this.fighter?.equipment.weapon === "Iron Sword",
      armor: this.fighter?.equipment.armor === "Leather Vest",
      health: this.fighter?.health ?? 45,
      maxHealth: this.fighter?.stats.maxHealth ?? 50,
      healingSupplies: this.fighter?.inventory.healing ?? 0,
    });
    const realExpedition = this.fighter?.status === "expedition";
    const names = heroDisplayNames(state.adventurers);
    this.previewText.textContent = realExpedition
      ? "EXPEDITION PREVIEW · Combat here does not advance the day or overwrite the saved outcome."
      : "TRAINING PREVIEW · No hero is currently on Level 6. This duel changes no saved state.";
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
    new HemisphericLight("arena-ambient", new Vector3(0, 1, 0), scene).intensity = 0.35;
    const lavaLight = new PointLight("lava-glow", new Vector3(0, 2, 0), scene);
    lavaLight.diffuse = new Color3(1, 0.29, 0.06);
    lavaLight.intensity = 2.5;
    lavaLight.range = 38;
    const makeMat = (name: string, hex: string, emissive = false): StandardMaterial => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      if (emissive) mat.emissiveColor = Color3.FromHexString(hex).scale(0.9);
      mat.specularColor = new Color3(0.08, 0.06, 0.04);
      return mat;
    };
    const stone = makeMat("basalt", "#29282a");
    const darkRock = makeMat("cave-rock", "#1b2024");
    const lava = makeMat("molten-lava", "#db390b", true);
    const fire = makeMat("lava-fire", "#fc8b18", true);
    const bone = makeMat("troll-bone", "#ae9e82");
    const trollSkin = makeMat("troll-skin", "#59694c");
    const trollDark = makeMat("troll-dark", "#343c36");
    const clubWood = makeMat("club", "#554333");
    const steel = makeMat("steel", "#98a8b9");
    const heroColor = makeMat("hero-coat", this.fighter?.role === "tank" ? "#536fa1" :
      this.fighter?.role === "healer" ? "#4f987e" : "#b7523c");
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
      diameter: 39, thickness: 4, tessellation: 96,
    }, scene);
    rim.position.y = -0.36;
    rim.material = fire;
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
    const part = (root: TransformNode, name: string, kind: "box" | "sphere" | "cylinder",
      dimensions: { width?: number; height?: number; depth?: number; diameter?: number },
      xyz: [number, number, number], material: StandardMaterial): TransformNode => {
      const mesh = kind === "box" ? MeshBuilder.CreateBox(name, {
        width: dimensions.width ?? 1, height: dimensions.height ?? 1, depth: dimensions.depth ?? 1,
      }, scene) : kind === "sphere" ? MeshBuilder.CreateSphere(name, {
        diameter: dimensions.diameter ?? 1,
      }, scene) : MeshBuilder.CreateCylinder(name, {
        diameter: dimensions.diameter ?? 1, height: dimensions.height ?? 1, tessellation: 10,
      }, scene);
      mesh.parent = root;
      mesh.position.set(...xyz);
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    const boss = new TransformNode("arena-boss-troll", scene);
    boss.position.set(0, 0, 2);
    boss.metadata = { kind: "boss", role: "boss" };
    part(boss, "troll-body", "sphere", { diameter: 4.2 }, [0, 3.2, 0], trollSkin).scaling.set(1, 1.2, 0.7);
    part(boss, "troll-head", "sphere", { diameter: 2.4 }, [0, 6.4, 0.2], trollSkin);
    for (const side of [-1, 1]) {
      const legPivot = new TransformNode("troll-leg-pivot-" + side, scene);
      legPivot.parent = boss;
      legPivot.position.set(side * 1.1, 2.45, 0);
      part(legPivot, "troll-leg-" + side, "cylinder", { diameter: 1.35, height: 3 },
        [0, -1.25, 0], trollDark);
      this.trollLegs.push(legPivot);
      part(boss, "troll-horn-" + side, "cylinder", { diameter: 0.65, height: 1.4 },
        [side * 0.9, 7.65, 0.1], bone).rotation.z = side * 0.6;
      part(boss, "troll-eye-" + side, "sphere", { diameter: 0.35 },
        [side * 0.52, 6.6, -0.91], fire);
    }
    part(boss, "troll-nose", "sphere", { diameter: 0.9 }, [0, 6.1, -1.02], trollDark);
    const arm = new TransformNode("troll-club-arm-pivot", scene);
    arm.parent = boss;
    arm.position.set(2.15, 5.1, 0);
    part(arm, "troll-arm", "cylinder", { diameter: 1.1, height: 3.5 }, [0.2, -1.5, 0], trollSkin);
    part(arm, "troll-club-handle", "cylinder", { diameter: 0.6, height: 4.5 }, [0.7, -3.45, -0.5], clubWood);
    part(arm, "troll-club-head", "cylinder", { diameter: 1.6, height: 2.3 }, [0.7, -5.8, -0.5], darkRock);
    this.swing = arm;
    this.boss = { root: boss, hp: BOSS_HP, max: BOSS_HP, alive: true };

    const hero = new TransformNode("arena-hero-" + (this.fighter?.id ?? "preview"), scene);
    hero.position.set(0, 0, -9);
    hero.metadata = { kind: "hero", adventurerId: this.fighter?.id ?? null };
    part(hero, "hero-chest", "box", { width: 1.05, height: 1.4, depth: 0.6 }, [0, 1.65, 0], heroColor);
    part(hero, "hero-head", "sphere", { diameter: 0.65 }, [0, 2.75, 0], bone);
    for (const side of [-1, 1]) {
      const leg = new TransformNode("hero-leg-pivot-" + side, scene);
      leg.parent = hero;
      leg.position.set(side * 0.28, 1.0, 0);
      part(leg, "hero-leg-" + side, "cylinder", { diameter: 0.3, height: 1.5 },
        [0, -0.55, 0], trollDark);
      this.heroLegs.push(leg);
      part(hero, "hero-arm-" + side, "cylinder", { diameter: 0.28, height: 1.2 },
        [side * 0.75, 1.75, 0], heroColor).rotation.z = side * 0.25;
    }
    const weaponPivot = new TransformNode("hero-attack-pivot", scene);
    weaponPivot.parent = hero;
    weaponPivot.position.set(1.05, 2.25, -0.3);
    this.heroWeapon = weaponPivot;
    if (this.fighter?.equipment.weapon === "Iron Sword") {
      part(weaponPivot, "equipped-iron-sword", "box",
        { width: 0.14, height: 1.9, depth: 0.2 }, [0.15, 0.35, -0.1], steel).rotation.z = 0.35;
    } else {
      part(weaponPivot, "basic-weapon", "cylinder", { diameter: 0.12, height: 1.15 },
        [0.15, 0.3, -0.1], clubWood);
    }
    if (this.fighter?.equipment.armor === "Leather Vest") {
      part(hero, "equipped-leather-vest", "box", { width: 1.1, height: 0.8, depth: 0.72 },
        [0, 1.7, -0.02], clubWood);
    }
    this.hero = { root: hero, hp: this.motion.heroHp,
      max: this.motion.options.maxHealth, alive: true };
    const telegraph = MeshBuilder.CreateBox("boss-active-attack-warning",
      { width: 7.8, height: 0.035, depth: 5.6 }, scene);
    telegraph.material = makeMat("boss-warning-red", "#b82513", true);
    telegraph.visibility = 0;
    telegraph.isPickable = false;
    this.telegraph = telegraph;
    const displayName = this.fighter ? names.get(this.fighter.id) ?? this.fighter.name : "Preview Hero";
    this.targets = [
      { label: displayName + " · " + (this.fighter?.role ?? "tank"), node: hero,
        vantage: new Vector3(5, 5, -8) },
      { label: "THE CAVE TROLL · BOSS", node: boss, vantage: new Vector3(10, 9, -9) },
    ];
    this.focusIndex = 0;
    this.focusCamera();
    this.status.textContent = "The Cave Troll is guarding Level 6.";
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
    this.camera.setTarget(target.node.position.add(new Vector3(0,
      this.focusIndex === 0 ? 1.7 : 4.3, 0)));
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

    this.motionAccumulator += frameDt;
    const fixedDt = 1 / 60;
    let ticks = 0;
    while (this.motionAccumulator >= fixedDt && ticks++ < 6) {
      const cues = stepCombatPreview(this.motion, fixedDt);
      for (const cue of cues) this.displayCue(cue);
      this.motionAccumulator -= fixedDt;
    }
    this.paintCombat();
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
      victory: "VICTORY · Cave Troll defeated. Preview only.",
      defeat: "DEFEAT · Hero fell in combat. Preview only.",
    };
    this.status.textContent = messages[cue.kind];
  }

  private paintCombat(): void {
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
    for (const [index, leg] of this.trollLegs.entries()) {
      leg.rotation.x = movedBoss > 0.005
        ? Math.sin(state.time * 5 + index * Math.PI) * 0.25 : 0;
    }
    if (this.heroWeapon) {
      const attacking = state.heroPhase === "attack";
      const casting = state.heroPhase === "cast" || state.heroPhase === "heal";
      this.heroWeapon.rotation.z = attacking
        ? Math.sin(Math.min(1, state.heroAge / 0.6) * Math.PI) * -2.1
        : state.heroPhase === "parry" ? -1.1 : casting ? -0.9 : 0;
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
    if (this.swing) {
      const age = state.bossAge;
      this.swing.rotation.z = state.bossPhase === "windup"
        ? -1.0 - Math.min(1, age / 0.85) * 0.4
        : state.bossPhase === "strike" ? 1.6 * Math.min(1, age / 0.22)
        : state.bossPhase === "recover" ? 0.4 * (1 - Math.min(1, age / 0.7))
        : state.bossPhase === "stagger" ? -0.9 : 0;
    }
    if (this.telegraph) {
      this.telegraph.visibility = state.bossPhase === "windup" ? 0.48 : 0;
      this.telegraph.position.set(
        state.boss.x + Math.sin(state.lockedBossHeading) * 2.9,
        0.14,
        state.boss.z + Math.cos(state.lockedBossHeading) * 2.9,
      );
      this.telegraph.rotation.y = state.lockedBossHeading;
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
    this.panel.dataset.result = this.result;
  }
}
