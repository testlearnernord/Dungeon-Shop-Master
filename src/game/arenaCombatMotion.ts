import type { Point2 } from "./combatGeometry.ts";
import { meleeAbilityProfile, resolveMeleeContact } from "./combatMelee.ts";
import {
  applyCombatHit, applyCombatHealing, HEALING_HERB_HP,
} from "./combatVitality.ts";
export { inAttackArc, rollInvulnerable, parryActive } from "./combatGeometry.ts";
export type { Point2 } from "./combatGeometry.ts";

/**
 * Existing Level-6 duel motor. It still resolves its authoritative recorded
 * fights; hit geometry and defense windows are now shared with group combat.
 */
export type ActorPhase = "move" | "roll" | "parry" | "attack" | "cast" | "heal" | "hurt" |
  "grabbed" | "thrown" | "dead";
export type BossPhase = "chase" | "windup" | "strike" | "grab" | "throw" |
  "grabMiss" | "recover" | "stagger" | "dead";
export type BossAttack = "smash" | "slam" | "grab";
export type CueKind = "windup" | "dodge" | "parry" | "miss" | "hit" | "hero-hit" |
  "grab" | "throw" | "projectile" | "heal" | "stagger" | "lava" | "victory" | "defeat";
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
  /** Training/campaign tactics are deterministic, but each windup is read once. */
  lastDefenseAttack: number;
  rollRisksLava: boolean;
  bossPhase: BossPhase;
  bossAge: number;
  bossCooldown: number;
  bossDamageApplied: boolean;
  bossAttacks: number;
  bossSlam: boolean;
  bossAttack: BossAttack;
  /** Authoritative horizontal launch speed; stored replay only needs frame positions. */
  throwVelocity: Point2;
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
// Longer actual encounters, not slowed playback or an artificial HP gate.
export const BOSS_MAX_HP = 280;
export const WALKABLE_RADIUS = 16.8;
const HERO_RADIUS = 0.58;
// Leave a real buffer between the hero's body and the molten arena ring.
// All normal navigation, rolls and knockback respect this radius.
export const SAFE_HERO_RADIUS = WALKABLE_RADIUS - HERO_RADIUS - 1.0;
/** Timing belongs to the combat motor; animated clips only sample its phases. */
export const GRAPPLE_TIMING = Object.freeze({
  windup: 1.20,      // readable approach
  trackUntil: 0.65,  // face the hero only early, then lock for counterplay
  grabContact: 0.30, // hand reaches the hero
  grab: 1.25,        // actual catch and deliberate lift
  throwRelease: 0.58,
  throw: 1.55,       // full arm follow-through
  flight: 0.90,      // same distance as the old throw, but airborne longer
  missRecover: 0.62,
  recover: 0.85,
});
const LAVA_CONTACT_DAMAGE = 12;
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
export function bossStrikeGeometry(slam: boolean): BossStrikeGeometry {
  const ability=meleeAbilityProfile(slam?"troll-slam":"troll-smash");
  return {reach:ability.reach,halfAngleRadians:ability.halfAngleRadians};
}
export function createCombatPreview(options: CombatPreviewOptions): CombatPreviewState {
  return {
    options, time: 0,
    hero: v(0, -9), boss: v(0, 2),
    heroHeading: 0, bossHeading: Math.PI, lockedBossHeading: Math.PI,
    heroHp: options.health, bossHp: BOSS_MAX_HP, stamina: 100,
    heroPhase: "move", heroAge: 0, heroCooldown: 0, heroApplied: false,
    rollDirection: v(1, 0), lastDefenseAttack: -1, rollRisksLava: false,
    bossPhase: "chase", bossAge: 0,
    bossCooldown: 1.1 + ((options.tacticsSeed ?? 0) % 7) * 0.06,
    bossDamageApplied: false, bossAttacks: 0, bossSlam: false,
    bossAttack: "smash", throwVelocity: v(0,0), bossStamina: 0,
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
function clampToRadius(point: Point2, radius: number): void {
  const d = Math.hypot(point.x, point.z);
  if (d > radius && d > 0) {
    point.x *= radius / d;
    point.z *= radius / d;
  }
}
function walk(s: CombatPreviewState, direction: Point2, meters: number,
  riskyRoll = false): void {
  const startX = s.hero.x, startZ = s.hero.z;
  s.hero.x += direction.x * meters;
  s.hero.z += direction.z * meters;
  if (riskyRoll && Math.hypot(s.hero.x, s.hero.z) > WALKABLE_RADIUS) {
    // The bad dodge really reached the molten edge. Burn once and redirect
    // the remaining roll inward instead of inflicting damage every 60 Hz tick.
    lavaContact(s);
    s.rollDirection = unit(-s.hero.x, -s.hero.z);
    s.rollRisksLava = false;
  } else {
    clampToRadius(s.hero, riskyRoll ? WALKABLE_RADIUS : SAFE_HERO_RADIUS);
  }
  s.distanceTraveled += Math.hypot(s.hero.x - startX, s.hero.z - startZ);
}
/** Stable per-attack choices: never consume GameStore RNG or Math.random().
 * No saving/replay format changes: only newly resolved fights sample tactics. */
function combatRoll(s: CombatPreviewState, salt: number): number {
  let n = ((s.options.tacticsSeed ?? 7) ^ Math.imul(s.bossAttacks, 0x9e3779b1) ^ salt) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 0x100000000;
}
/** Boundary contact is real, bounded damage, never a teleporting one-hit.
 * The AI normally stays in the safe interior; slams can still throw a hero
 * to the ledge and burn them. Historical saved combats are never re-run. */
function lavaContact(s: CombatPreviewState): void {
  const damageResult=applyCombatHit(s.heroHp,LAVA_CONTACT_DAMAGE,0,0);
  if (damageResult.amount<=0) return;
  s.heroHp=damageResult.hp;
  s.cues.push({ kind: "lava", amount:damageResult.amount });
  clampToRadius(s.hero, SAFE_HERO_RADIUS);
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
  let direction = unit(tangent.x + toBoss.x * radial, tangent.z + toBoss.z * radial);
  const distanceFromCenter = Math.hypot(s.hero.x,s.hero.z);
  const edgeWeight = Math.max(0,Math.min(1,
    (distanceFromCenter - (SAFE_HERO_RADIUS - 2.0)) / 2.0));
  if (edgeWeight > 0) {
    const inward = unit(-s.hero.x,-s.hero.z);
    direction = unit(direction.x*(1-edgeWeight)+inward.x*edgeWeight*1.6,
      direction.z*(1-edgeWeight)+inward.z*edgeWeight*1.6);
  }
  const speed = s.options.role === "tank" ? 2.7 : 3.7;
  walk(s, direction, dt * speed);
}
function startRoll(s: CombatPreviewState): void {
  if (s.stamina < 28 || s.heroPhase !== "move") return;
  s.stamina -= 28;
  const toward = heroToBoss(s);
  const side = s.bossAttacks % 2 === 0 ? 1 : -1;
  // Cross the monster's locked swing direction; not an in-place animation.
  const candidate = (sign:number) => unit(
    -toward.z * sign - toward.x * 0.3,
    toward.x * sign - toward.z * 0.3);
  const intended = candidate(side), alternate = candidate(-side);
  const projectedRadius = (dir:Point2) =>
    Math.hypot(s.hero.x + dir.x * 5.565,s.hero.z + dir.z * 5.565);
  const agility = s.options.agility ?? 10;
  const nearEdge = Math.hypot(s.hero.x,s.hero.z) > SAFE_HERO_RADIUS - 3.5;
  // A panic dodge near the ledge can pick the dangerous outward lane.
  // Skilled fighters do it less often. The safer lane stays the normal choice.
  s.rollRisksLava = nearEdge && combatRoll(s, 0x33a8) <
    Math.max(0.12, Math.min(0.48, 0.42 - (agility - 9) * 0.018));
  s.rollDirection = s.rollRisksLava
    ? (projectedRadius(alternate) > projectedRadius(intended) ? alternate : intended)
    : (projectedRadius(alternate) < projectedRadius(intended) ? alternate : intended);
  if (!s.rollRisksLava && projectedRadius(s.rollDirection) > SAFE_HERO_RADIUS) {
    const inward = unit(-s.hero.x,-s.hero.z);
    s.rollDirection = unit(inward.x + s.rollDirection.x * .22,
      inward.z + s.rollDirection.z * .22);
  }
  beginHero(s, "roll");
}
function startParry(s: CombatPreviewState): void {
  if (s.stamina < 20 || s.heroPhase !== "move") return;
  s.stamina -= 20;
  beginHero(s, "parry");
}
function resolveBossStrike(s: CombatPreviewState): void {
  const contact=resolveMeleeContact({
    attacker:s.boss,lockedHeading:s.lockedBossHeading,
    defender:s.hero,defenderHeading:s.heroHeading,
    defenderPhase:s.heroPhase,defenderPhaseAge:s.heroAge,
    defenderHasWeapon:s.options.sword,
    ability:meleeAbilityProfile(s.bossSlam?"troll-slam":"troll-smash"),
  });
  if(contact==="miss"){
    s.missedHits++;s.cues.push({kind:"miss"});
    return;
  }
  if(contact==="dodge"){
    s.dodgeCount++;s.cues.push({kind:"dodge"});
    return;
  }
  if(contact==="parry"){
    s.parryCount++;
    s.cues.push({kind:"parry"},{kind:"stagger"});
    const counter=applyCombatHit(s.bossHp,s.options.sword?8:3);
    s.bossHp=counter.hp;
    s.cues.push({kind:"hero-hit",amount:counter.amount});
    beginBoss(s,"stagger");
    return;
  }
  // An actual smash must threaten a well-equipped hero who misreads it.
  const raw = s.bossSlam ? 47 : 33;
  const damageResult=applyCombatHit(s.heroHp,raw,
    (s.options.armor?7:0)+(s.options.role==="tank"?3:0));
  s.heroHp=damageResult.hp;
  s.cues.push({kind:"hit",amount:damageResult.amount});
  const knockback = unit(s.hero.x - s.boss.x, s.hero.z - s.boss.z);
  const meters=s.bossSlam ? 3.6 : 1.5;
  const landing={x:s.hero.x+knockback.x*meters,
    z:s.hero.z+knockback.z*meters};
  walk(s, knockback, meters);
  if (Math.hypot(landing.x,landing.z)>WALKABLE_RADIUS) lavaContact(s);
  if (s.heroHp>0) beginHero(s, "hurt");
}
/** A grab is a short-range physical contact, not a guaranteed cutscene.
 * A hero can roll away, counter with a sword parry or break the grip. */
function resolveBossGrab(s: CombatPreviewState): void {
  // Uses exactly the same geometric contact/defense arbitration as all
  // other melee attacks; capture, struggle and airborne throw are a
  // distinct boss ability invoked only after a successful contact.
  const contact=resolveMeleeContact({
    attacker:s.boss,lockedHeading:s.lockedBossHeading,
    defender:s.hero,defenderHeading:s.heroHeading,
    defenderPhase:s.heroPhase,defenderPhaseAge:s.heroAge,
    defenderHasWeapon:s.options.sword,
    ability:meleeAbilityProfile("troll-grab"),
  });
  if(contact==="miss" || contact==="dodge"){
    if(contact==="dodge")s.dodgeCount++;
    else s.missedHits++;
    s.cues.push({kind:contact});
    beginBoss(s,"grabMiss");
    return;
  }
  if(contact==="parry"){
    s.parryCount++;
    s.cues.push({kind:"parry"},{kind:"stagger"});
    const counter=applyCombatHit(s.bossHp,8);
    s.bossHp=counter.hp;
    s.cues.push({kind:"hero-hit",amount:counter.amount});
    beginBoss(s,"stagger");
    return;
  }
  const agility=s.options.agility??10;
  const breakFree=Math.max(.035,Math.min(.20,.065+(agility-10)*.012));
  if (combatRoll(s,0x5513)<breakFree) {
    s.missedHits++;
    s.cues.push({kind:"miss"});
    beginBoss(s,"grabMiss");
    return;
  }
  beginHero(s,"grabbed");
  s.hero.x=s.boss.x+Math.sin(s.lockedBossHeading)*2.15;
  s.hero.z=s.boss.z+Math.cos(s.lockedBossHeading)*2.15;
  s.cues.push({kind:"grab"});
}

/** Only real landing, not launch, subtracts HP. Rim contact causes one
 * additional bounded lava tick and pushes the survivor onto safe rock. */
function landThrownHero(s: CombatPreviewState, lava: boolean): void {
  // A full-body slam from a multi-metre throw is rarer and more dangerous
  // than a basic fist hit. Armor still mitigates it; lava is separate damage.
  const raw=42;
  const damageResult=applyCombatHit(s.heroHp,raw,
    (s.options.armor?6:0)+(s.options.role==="tank"?2:0));
  s.heroHp=damageResult.hp;
  s.cues.push({kind:"hit",amount:damageResult.amount});
  if (lava && s.heroHp>0) lavaContact(s);
  if (s.heroHp>0) beginHero(s,"hurt");
  else s.heroPhase="dead";
}

function resolveHeroStrike(s: CombatPreviewState): void {
  const reach = s.options.sword ? 4.2 : 3.2;
  const contact=resolveMeleeContact({
    attacker:s.hero,lockedHeading:s.heroHeading,
    defender:s.boss,defenderHeading:s.bossHeading,
    defenderPhase:s.bossPhase,defenderPhaseAge:s.bossAge,
    ability:meleeAbilityProfile("hero-strike",reach+TROLL_RADIUS),
  });
  if (contact!=="hit") {
    s.missedHits++; s.cues.push({ kind: "miss" });
    return;
  }
  const amount = (s.options.sword ? 16 : 6) + (s.options.role === "DPS" ? 5 : 0) +
    Math.floor(Math.max(0, (s.options.strength ?? 6) - 6) / 3);
  const damageResult=applyCombatHit(s.bossHp,amount);
  s.bossHp=damageResult.hp;
  s.landedHits++; s.cues.push({ kind: "hero-hit", amount: damageResult.amount });
}
function progressHeroAction(s: CombatPreviewState, dt: number): void {
  if (s.heroPhase === "move" || s.heroPhase === "dead") return;
  s.heroAge += dt;
  if (s.heroPhase === "grabbed") {
    s.hero.x=s.boss.x+Math.sin(s.lockedBossHeading)*2.15;
    s.hero.z=s.boss.z+Math.cos(s.lockedBossHeading)*2.15;
  } else if (s.heroPhase === "thrown") {
    s.hero.x+=s.throwVelocity.x*dt;
    s.hero.z+=s.throwVelocity.z*dt;
    if (Math.hypot(s.hero.x,s.hero.z)>WALKABLE_RADIUS) {
      landThrownHero(s,true);
    } else if (s.heroAge>=GRAPPLE_TIMING.flight) {
      landThrownHero(s,false);
    }
  } else if (s.heroPhase === "roll") {
    walk(s, s.rollDirection, dt * 10.5, s.rollRisksLava);
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
      const consumesHerb=s.healingSupplies>0;
      // Owned Healing Herbs always heal exactly their catalog value.
      // A healer's innate magic remains its separate 25-HP class action.
      const amount=consumesHerb?HEALING_HERB_HP:25;
      const heal=applyCombatHealing(s.heroHp,s.options.maxHealth,amount);
      s.heroHp=heal.hp;
      if(heal.amount>0){
        if(consumesHerb)s.healingSupplies--;
        else s.magicHeals--;
        s.cues.push({kind:"heal",amount:heal.amount});
      }
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
      clampToRadius(s.boss,WALKABLE_RADIUS-TROLL_RADIUS-.65);
    }
    s.bossCooldown -= dt;
    if (s.bossCooldown <= 0 && gap < 7.7) {
      s.bossAttacks++;
      // Give the signature grab real screen time: melee-only, with a
      // deterministic roughly 58% selection among eligible attacks. Every
      // fourth attack is a guaranteed ATTEMPT, never a guaranteed capture.
      // Real arc checks, dodge, parry and agility can still break the grip.
      s.bossAttack = gap < 5.3 && s.bossAttacks > 1 &&
        (s.bossAttacks % 4 === 0 || combatRoll(s,0x7a91) < .45)
        ? "grab" :
        s.bossAttacks % 3 === 0 ? "slam" : "smash";
      s.bossSlam = s.bossAttack === "slam";
      s.lockedBossHeading = facing(s.boss, s.hero);
      s.bossHeading = s.lockedBossHeading;
      beginBoss(s, "windup");
      s.cues.push({ kind: "windup" });
    }
  } else if (s.bossPhase === "windup") {
    // The troll visually follows a circling target during the early reach,
    // then commits to a locked warning lane long enough to dodge or parry.
    if (s.bossAttack==="grab" && s.bossAge<=GRAPPLE_TIMING.trackUntil) {
      s.lockedBossHeading=facing(s.boss,s.hero);
      s.bossHeading=s.lockedBossHeading;
    }
    if (s.bossAge >= (s.bossAttack==="grab" ? GRAPPLE_TIMING.windup :
        s.bossSlam ? 1.05 : .85))
      beginBoss(s, s.bossAttack==="grab" ? "grab" : "strike");
  } else if (s.bossPhase === "grab") {
    if (s.bossAge >= GRAPPLE_TIMING.grabContact && !s.bossDamageApplied) {
      s.bossDamageApplied=true;
      resolveBossGrab(s);
    }
    if (s.bossPhase==="grab" && s.bossAge>=GRAPPLE_TIMING.grab)
      beginBoss(s,"throw");
  } else if (s.bossPhase === "grabMiss") {
    // A failed catch retracts its hand. It must NEVER play the throw clip.
    if (s.bossAge >= GRAPPLE_TIMING.missRecover) {
      beginBoss(s,"chase");
      s.bossCooldown=1.45;
    }
  } else if (s.bossPhase === "throw") {
    if (s.bossAge>=GRAPPLE_TIMING.throwRelease && !s.bossDamageApplied) {
      s.bossDamageApplied=true;
      if (s.heroPhase==="grabbed") {
        const direction=unit(s.hero.x-s.boss.x,s.hero.z-s.boss.z);
        const speed=7.5/GRAPPLE_TIMING.flight;
        s.throwVelocity=v(direction.x*speed,direction.z*speed);
        beginHero(s,"thrown");
        s.cues.push({kind:"throw"});
      }
    }
    if (s.bossAge>=GRAPPLE_TIMING.throw) beginBoss(s,"recover");
  } else if (s.bossPhase === "strike") {
    if (s.bossAge >= 0.14 && !s.bossDamageApplied) {
      s.bossDamageApplied = true;
      resolveBossStrike(s);
    }
    if (s.bossPhase === "strike" && s.bossAge >= 0.38) beginBoss(s, "recover");
  } else if (s.bossPhase === "recover") {
    if (s.bossAge >= (s.bossAttack==="grab" ? GRAPPLE_TIMING.recover : 0.72)) {
      beginBoss(s, "chase");
      s.bossCooldown = 1.50;
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
      const damageResult=applyCombatHit(s.bossHp,p.damage);
      s.bossHp=damageResult.hp;
      s.landedHits++; s.cues.push({ kind: "hero-hit", amount: damageResult.amount });
    }
  }
  s.projectiles = s.projectiles.filter(p => p.ttl > 0);
}
export function stepCombatPreview(s: CombatPreviewState, dt: number): readonly ArenaCue[] {
  s.cues = [];
  if (s.outcome !== "fighting") return s.cues;
  if (dt <= 0 || dt > 0.1) throw new RangeError("Action motor requires a fixed step of at most 100 ms.");
  s.time += dt;
  // Legacy or externally displaced positions can touch the molten boundary.
  // Apply bounded fire damage once and move back inside, rather than
  // instantly wiping a perfectly healthy adventurer on the next step.
  if (Math.hypot(s.hero.x,s.hero.z)>WALKABLE_RADIUS) lavaContact(s);
  s.stamina = Math.min(100, s.stamina + 18 * dt);
  s.heroCooldown = Math.max(0, s.heroCooldown - dt);
  s.heroHeading = facing(s.hero, s.boss);
  if (s.heroPhase === "move") {
    const distance = dist(s.hero, s.boss);
    if (s.bossPhase === "windup" && s.lastDefenseAttack !== s.bossAttacks &&
        distance < 7.2) {
      const agility = s.options.agility ?? 10;
      const read = combatRoll(s, 0xb220);
      const timing = read < 0.12 ? (s.bossSlam ? 0.40 : 0.22)
        : (s.bossAttack==="grab" ? GRAPPLE_TIMING.windup-0.04 :
          s.bossSlam ? 0.88 : 0.68);
      if (s.bossAge >= timing) {
        s.lastDefenseAttack = s.bossAttacks;
        // A warning is not a guaranteed perfect reaction. Early blocks/rolls
        // expire before contact; some heroes hesitate and take the hit.
        const readiness = Math.max(0.38, Math.min(0.78,
          0.57 + (agility - 10) * 0.015 +
          (s.options.role === "tank" ? 0.08 : 0) -
          (s.bossAttack==="grab" ? 0.10 : 0)));
        if (read < readiness) {
          const parryBias = s.options.role === "tank" ? 0.82 : 0.28;
          if (s.options.sword && distance < 5.0 &&
              combatRoll(s, 0x8ba2) < parryBias) startParry(s);
          else startRoll(s);
        }
      }
    }
    if (s.heroPhase === "move" && s.heroHp < s.options.maxHealth * 0.60 &&
        s.healingSupplies + s.magicHeals > 0 &&
        distance > (s.options.role === "healer" ? 3.6 : 4.7)) {
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
  // Emergency guard for non-navigation motion added by future mechanics.
  if (s.heroPhase!=="thrown" &&
      Math.hypot(s.hero.x,s.hero.z)>WALKABLE_RADIUS) lavaContact(s);
  if (s.heroHp <= 0) {
    s.outcome = "defeat"; s.heroPhase = "dead";
    s.cues.push({ kind: "defeat" });
  } else if (s.bossHp <= 0) {
    // A projectile can finish the troll during the hold or in mid-flight.
    if (s.heroPhase==="grabbed" || s.heroPhase==="thrown") {
      clampToRadius(s.hero,SAFE_HERO_RADIUS);
      beginHero(s,"move");
    }
    s.outcome = "victory"; s.bossPhase = "dead";
    s.cues.push({ kind: "victory" });
  }
  return s.cues;
}
