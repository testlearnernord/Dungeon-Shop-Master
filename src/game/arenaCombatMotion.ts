/**
 * Pure fixed-step 2D action-combat motor for the Level-6 3D spectator preview.
 * Everything that causes preview damage uses positions, facing, active frames,
 * stamina and collision geometry. No animation timer can create an invisible hit.
 *
 * This is NOT GameState combat resolution: the day-tick TrollBoss remains the
 * authority until its timeline is unified with this spatial action motor.
 */
export type Point2 = { x: number; z: number };
export type ActorPhase = "move" | "roll" | "parry" | "attack" | "cast" | "heal" | "hurt" | "dead";
export type BossPhase = "chase" | "windup" | "strike" | "recover" | "stagger" | "dead";
export type CueKind = "windup" | "dodge" | "parry" | "miss" | "hit" | "hero-hit" |
  "projectile" | "heal" | "stagger" | "lava" | "victory" | "defeat";
export type ArenaCue = { kind: CueKind; amount?: number };
export type ArenaRole = "tank" | "DPS" | "healer";
export type CombatPreviewOptions = {
  role: ArenaRole;
  sword: boolean;
  armor: boolean;
  health: number;
  maxHealth: number;
  healingSupplies: number;
  /** Optional campaign stats. Preview fixtures without these retain their original tuning. */
  strength?: number;
  agility?: number;
  intellect?: number;
  tacticsSeed?: number;
};
export type Projectile = { x: number; z: number; dx: number; dz: number; damage: number; ttl: number };
export type BossStrikeGeometry = { reach: number; halfAngleRadians: number };
export type CombatPreviewState = {
  readonly options: CombatPreviewOptions;
  time: number;
  hero: Point2;
  boss: Point2;
  heroHeading: number;
  bossHeading: number;
  lockedBossHeading: number;
  heroHp: number;
  bossHp: number;
  stamina: number;
  heroPhase: ActorPhase;
  heroAge: number;
  heroCooldown: number;
  heroApplied: boolean;
  rollDirection: Point2;
  bossPhase: BossPhase;
  bossAge: number;
  bossCooldown: number;
  bossDamageApplied: boolean;
  bossAttacks: number;
  bossSlam: boolean;
  bossStamina: number;
  magicHeals: number;
  healingSupplies: number;
  projectiles: Projectile[];
  cues: ArenaCue[];
  outcome: "fighting" | "victory" | "defeat";
  distanceTraveled: number;
  dodgeCount: number;
  parryCount: number;
  landedHits: number;
  missedHits: number;
};
export const BOSS_MAX_HP = 145;
export const WALKABLE_RADIUS = 16.8;
const HERO_RADIUS = 0.58;
const TROLL_RADIUS = 1.8;
const TAU = Math.PI * 2;
const v = (x: number, z: number): Point2 => ({ x, z });
const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);
const unit = (x: number, z: number): Point2 => {
  const d = Math.hypot(x, z);
  return d > 0.00001 ? v(x / d, z / d) : v(0, 1);
};
const facing = (from: Point2, to: Point2) =>
  Math.atan2(to.x - from.x, to.z - from.z);
export function inAttackArc(origin: Point2, heading: number, target: Point2,
  reach: number, halfAngleRadians: number): boolean {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d > reach || d < 0.000001) return false;
  const alignment = (dx * Math.sin(heading) + dz * Math.cos(heading)) / d;
  return alignment >= Math.cos(halfAngleRadians);
}
export function bossStrikeGeometry(slam: boolean): BossStrikeGeometry {
  return {
    reach: (slam ? 6.2 : 5.2) + HERO_RADIUS,
    halfAngleRadians: slam ? 1.3 : 0.90,
  };
}
export function rollInvulnerable(age: number): boolean {
  return age >= 0.09 && age <= 0.43;
}
export function parryActive(age: number): boolean {
  return age >= 0.10 && age <= 0.36;
}
export function createCombatPreview(options: CombatPreviewOptions): CombatPreviewState {
  return {
    options, time: 0,
    hero: v(0, -9), boss: v(0, 2),
    heroHeading: 0, bossHeading: Math.PI, lockedBossHeading: Math.PI,
    heroHp: options.health, bossHp: BOSS_MAX_HP, stamina: 100,
    heroPhase: "move", heroAge: 0, heroCooldown: 0, heroApplied: false,
    rollDirection: v(1, 0),
    bossPhase: "chase", bossAge: 0,
    bossCooldown: 1.1 + ((options.tacticsSeed ?? 0) % 7) * 0.06,
    bossDamageApplied: false, bossAttacks: 0, bossSlam: false, bossStamina: 0,
    magicHeals: options.role === "healer" ? 2 : 0,
    healingSupplies: options.healingSupplies,
    projectiles: [], cues: [], outcome: "fighting",
    distanceTraveled: 0, dodgeCount: 0, parryCount: 0,
    landedHits: 0, missedHits: 0,
  };
}
function beginHero(s: CombatPreviewState, phase: ActorPhase): void {
  s.heroPhase = phase; s.heroAge = 0; s.heroApplied = false;
}
function beginBoss(s: CombatPreviewState, phase: BossPhase): void {
  s.bossPhase = phase; s.bossAge = 0;
  s.bossDamageApplied = false;
}
function walk(s: CombatPreviewState, direction: Point2, meters: number): void {
  const startX = s.hero.x, startZ = s.hero.z;
  s.hero.x += direction.x * meters;
  s.hero.z += direction.z * meters;
  s.distanceTraveled += Math.hypot(s.hero.x - startX, s.hero.z - startZ);
}
function heroToBoss(s: CombatPreviewState): Point2 {
  return unit(s.boss.x - s.hero.x, s.boss.z - s.hero.z);
}
function maintainSpacing(s: CombatPreviewState, dt: number): void {
  const toBoss = heroToBoss(s);
  const gap = dist(s.hero, s.boss);
  const ranged = s.options.role === "healer" || (s.options.role === "DPS" && !s.options.sword);
  const desired = ranged ? 8 : 3.15;
  const strafeSign = (Math.floor(s.time / 5.5) + ((s.options.tacticsSeed ?? 0) % 2)) % 2 === 0 ? 1 : -1;
  const tangent = v(-toBoss.z * strafeSign, toBoss.x * strafeSign);
  const radial = gap > desired + 0.4 ? 0.95 : gap < desired - 0.35 ? -1 : 0;
  const direction = unit(tangent.x + toBoss.x * radial, tangent.z + toBoss.z * radial);
  const speed = s.options.role === "tank" ? 2.7 : 3.7;
  walk(s, direction, dt * speed);
}
function startRoll(s: CombatPreviewState): void {
  if (s.stamina < 28 || s.heroPhase !== "move") return;
  s.stamina -= 28;
  const toward = heroToBoss(s);
  const side = s.bossAttacks % 2 === 0 ? 1 : -1;
  // Cross the monster's locked swing direction; not an in-place animation.
  s.rollDirection = unit(-toward.z * side - toward.x * 0.3, toward.x * side - toward.z * 0.3);
  beginHero(s, "roll");
}
function startParry(s: CombatPreviewState): void {
  if (s.stamina < 20 || s.heroPhase !== "move") return;
  s.stamina -= 20;
  beginHero(s, "parry");
}
function resolveBossStrike(s: CombatPreviewState): void {
  const { reach, halfAngleRadians } = bossStrikeGeometry(s.bossSlam);
  const hit = inAttackArc(s.boss, s.lockedBossHeading, s.hero, reach, halfAngleRadians);
  if (!hit) {
    s.missedHits++; s.cues.push({ kind: "miss" });
    return;
  }
  if (s.heroPhase === "roll" && rollInvulnerable(s.heroAge)) {
    s.dodgeCount++; s.cues.push({ kind: "dodge" });
    return;
  }
  if (s.heroPhase === "parry" && parryActive(s.heroAge) &&
      inAttackArc(s.hero, s.heroHeading, s.boss, 6.8, 1.25)) {
    s.parryCount++;
    s.cues.push({ kind: "parry" }, { kind: "stagger" });
    s.bossHp = Math.max(0, s.bossHp - (s.options.sword ? 8 : 3));
    beginBoss(s, "stagger");
    return;
  }
  const raw = s.bossSlam ? 23 : 17;
  const damage = Math.max(1, raw - (s.options.armor ? 7 : 0) -
    (s.options.role === "tank" ? 3 : 0));
  s.heroHp = Math.max(0, s.heroHp - damage);
  s.cues.push({ kind: "hit", amount: damage });
  const knockback = unit(s.hero.x - s.boss.x, s.hero.z - s.boss.z);
  walk(s, knockback, s.bossSlam ? 3.6 : 1.5);
  if (Math.hypot(s.hero.x, s.hero.z) > WALKABLE_RADIUS) {
    s.heroHp = 0; s.cues.push({ kind: "lava" });
  } else {
    beginHero(s, "hurt");
  }
}
function resolveHeroStrike(s: CombatPreviewState): void {
  const reach = s.options.sword ? 4.2 : 3.2;
  const hit = inAttackArc(s.hero, s.heroHeading, s.boss, reach + TROLL_RADIUS, 0.93);
  if (!hit) {
    s.missedHits++; s.cues.push({ kind: "miss" });
    return;
  }
  const amount = (s.options.sword ? 16 : 6) + (s.options.role === "DPS" ? 5 : 0) +
    Math.floor(Math.max(0, (s.options.strength ?? 6) - 6) / 3);
  s.bossHp = Math.max(0, s.bossHp - amount);
  s.landedHits++; s.cues.push({ kind: "hero-hit", amount });
}
function progressHeroAction(s: CombatPreviewState, dt: number): void {
  if (s.heroPhase === "move" || s.heroPhase === "dead") return;
  s.heroAge += dt;
  if (s.heroPhase === "roll") {
    walk(s, s.rollDirection, dt * 10.5);
    if (s.heroAge >= 0.53) beginHero(s, "move");
  } else if (s.heroPhase === "parry") {
    if (s.heroAge >= 0.52) beginHero(s, "move");
  } else if (s.heroPhase === "hurt") {
    if (s.heroAge >= 0.33) beginHero(s, "move");
  } else if (s.heroPhase === "attack") {
    if (s.heroAge >= 0.28 && !s.heroApplied) {
      s.heroApplied = true;
      resolveHeroStrike(s);
    }
    if (s.heroAge >= 0.68) beginHero(s, "move");
  } else if (s.heroPhase === "cast") {
    if (s.heroAge >= 0.31 && !s.heroApplied) {
      s.heroApplied = true;
      const toBoss = heroToBoss(s);
      const dmg = (s.options.role === "healer" ? 9 : 12) + (s.options.sword ? 4 : 0) +
        Math.floor(Math.max(0, (s.options.intellect ?? 6) - 6) / 3);
      s.projectiles.push({
        x: s.hero.x, z: s.hero.z,
        dx: toBoss.x, dz: toBoss.z, damage: dmg, ttl: 1.9,
      });
      s.cues.push({ kind: "projectile" });
    }
    if (s.heroAge >= 0.74) beginHero(s, "move");
  } else if (s.heroPhase === "heal") {
    if (s.heroAge >= 0.72 && !s.heroApplied) {
      s.heroApplied = true;
      const amount = s.options.role === "healer" ? 25 : 18;
      const restored = Math.min(amount, s.options.maxHealth - s.heroHp);
      s.heroHp += restored;
      if (s.healingSupplies > 0) s.healingSupplies--;
      else s.magicHeals--;
      s.cues.push({ kind: "heal", amount: restored });
    }
    if (s.heroAge >= 0.91) beginHero(s, "move");
  }
}
function progressBossAction(s: CombatPreviewState, dt: number): void {
  s.bossAge += dt;
  if (s.bossPhase === "dead") return;
  if (s.bossPhase === "chase") {
    s.bossHeading = facing(s.boss, s.hero);
    const gap = dist(s.hero, s.boss);
    if (gap > 3.5) {
      const toHero = unit(s.hero.x - s.boss.x, s.hero.z - s.boss.z);
      const tangent = v(toHero.z, -toHero.x);
      s.boss.x += (toHero.x * 3.25 + tangent.x * 0.45) * dt;
      s.boss.z += (toHero.z * 3.25 + tangent.z * 0.45) * dt;
    }
    s.bossCooldown -= dt;
    if (s.bossCooldown <= 0 && gap < 7.7) {
      s.bossAttacks++;
      s.bossSlam = s.bossAttacks % 3 === 0;
      s.lockedBossHeading = facing(s.boss, s.hero);
      s.bossHeading = s.lockedBossHeading;
      beginBoss(s, "windup");
      s.cues.push({ kind: "windup" });
    }
  } else if (s.bossPhase === "windup") {
    // Heading locks at windup start. Dodging out of the cone *actually* avoids the swing.
    if (s.bossAge >= (s.bossSlam ? 1.05 : 0.85)) beginBoss(s, "strike");
  } else if (s.bossPhase === "strike") {
    if (s.bossAge >= 0.14 && !s.bossDamageApplied) {
      s.bossDamageApplied = true;
      resolveBossStrike(s);
    }
    if (s.bossPhase === "strike" && s.bossAge >= 0.38) beginBoss(s, "recover");
  } else if (s.bossPhase === "recover") {
    if (s.bossAge >= 0.72) {
      beginBoss(s, "chase");
      s.bossCooldown = 0.9;
    }
  } else if (s.bossPhase === "stagger") {
    if (s.bossAge >= 1.6) {
      beginBoss(s, "chase");
      s.bossCooldown = 1.4;
    }
  }
}
function progressProjectiles(s: CombatPreviewState, dt: number): void {
  for (const p of s.projectiles) {
    p.x += p.dx * 13 * dt;
    p.z += p.dz * 13 * dt;
    p.ttl -= dt;
    if (dist(p, s.boss) <= TROLL_RADIUS + 0.65) {
      p.ttl = 0;
      s.bossHp = Math.max(0, s.bossHp - p.damage);
      s.landedHits++; s.cues.push({ kind: "hero-hit", amount: p.damage });
    }
  }
  s.projectiles = s.projectiles.filter(p => p.ttl > 0);
}
export function stepCombatPreview(s: CombatPreviewState, dt: number): readonly ArenaCue[] {
  s.cues = [];
  if (s.outcome !== "fighting") return s.cues;
  if (dt <= 0 || dt > 0.1) throw new RangeError("Action motor requires a fixed step of at most 100 ms.");
  s.time += dt;
  s.stamina = Math.min(100, s.stamina + 18 * dt);
  s.heroCooldown = Math.max(0, s.heroCooldown - dt);
  s.heroHeading = facing(s.hero, s.boss);
  if (s.heroPhase === "move") {
    const distance = dist(s.hero, s.boss);
    if (s.bossPhase === "windup" && s.bossAge >= (s.bossSlam ? 0.88 : 0.68) &&
        distance < 7.2) {
      if (s.options.role === "tank" && s.options.sword && distance < 5.0) startParry(s);
      else startRoll(s);
    }
    if (s.heroPhase === "move" && s.heroHp < s.options.maxHealth * 0.43 &&
        s.healingSupplies + s.magicHeals > 0 && distance > 5.1) {
      beginHero(s, "heal");
    }
    if (s.heroPhase === "move" && s.heroCooldown <= 0 &&
        distance <= (s.options.role === "healer" ||
          (s.options.role === "DPS" && !s.options.sword) ? 15 : 5.3) &&
        s.stamina >= 13 && s.bossPhase !== "windup") {
      s.stamina -= 13;
      s.heroCooldown = s.options.role === "DPS" ? 1.05 : 1.4;
      beginHero(s, s.options.role === "healer" ||
        (s.options.role === "DPS" && !s.options.sword) ? "cast" : "attack");
    }
    if (s.heroPhase === "move") maintainSpacing(s, dt);
  }
  progressHeroAction(s, dt);
  progressBossAction(s, dt);
  progressProjectiles(s, dt);
  if (Math.hypot(s.hero.x, s.hero.z) > WALKABLE_RADIUS && s.heroHp > 0) {
    s.heroHp = 0; s.cues.push({ kind: "lava" });
  }
  if (s.heroHp <= 0) {
    s.outcome = "defeat"; s.heroPhase = "dead";
    s.cues.push({ kind: "defeat" });
  } else if (s.bossHp <= 0) {
    s.outcome = "victory"; s.bossPhase = "dead";
    s.cues.push({ kind: "victory" });
  }
  return s.cues;
}
