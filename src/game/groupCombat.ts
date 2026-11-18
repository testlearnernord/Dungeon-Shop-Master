import { inAttackArc, type Point2 } from "./combatGeometry.ts";
import { combatDirection, combatHeading, moveCombatant } from "./combatMovement.ts";
import type { CombatActionWindow } from "./combatActionClock.ts";
import {
  enterCombatActorPhase, advanceCombatActorPhase,
  refreshCombatActorResources, type CombatActorRuntime,
} from "./combatActor.ts";
import { meleeAbilityProfile, resolveMeleeContact } from "./combatMelee.ts";
import {
  chooseCombatAbility, chooseCombatDefense, chooseCombatPosture,
  selectCombatTarget,
} from "./combatTactics.ts";
import { combatSegmentBox, traceCombatProjectile } from "./combatProjectile.ts";
import {
  grappleEscapeChance, grappleEscapes, grappleHoldPosition,
  grappleLaunchVelocity, deterministicGrappleSample,
  GRAPPLE_FLIGHT_SECONDS,
} from "./combatGrapple.ts";
import {
  COMBAT_STEP_SECONDS, stepCombatEncounter, recordCombatEncounter,
  encounterTeamOutcome, type EncounterPipeline,
} from "./combatEncounter.ts";
import {
  applyCombatHit, applyCombatHealing, HEALING_HERB_HP,
} from "./combatVitality.ts";

/**
 * MVP 1.2b: a deterministic, render-independent multi-actor encounter motor.
 * Future dungeon exploration supplies positions and an arena. Neither this
 * module nor its replay ever mutates the merchant GameState or browser scene.
 * The Level-6 visual boss ability driver remains specialized while its
 * damage and healing now share the exact same HP rules as these encounters.
 */
export type CombatTeam = "heroes" | "monsters";
export type GroupRole = "tank" | "DPS" | "healer" | "monster";
export type AttackStyle = "melee" | "ranged";
export type GroupPhase = "move" | "windup" | "strike" | "recover" |
  "cast" | "heal" | "roll" | "parry" | "hurt" | "dead" |
  "grab" | "grabMiss" | "throw" | "grabbed" | "thrown";
export type GroupOutcome = "fighting" | "heroes" | "monsters" | "draw";

export interface CombatantSpec {
  readonly id: string;
  readonly team: CombatTeam;
  readonly role: GroupRole;
  readonly style: AttackStyle;
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly maxHp: number;
  /** Raw damage per landed hit, before mitigation. */
  readonly damage: number;
  readonly armor: number;
  readonly speed: number;
  readonly reach: number;
  readonly radius?: number;
  readonly healCharges?: number;
  /** Optional telegraphed heavy strike; absent preserves historical ordinary attacks. */
  readonly meleeAbility?: "heavy";
  /** Boss archetype uses the SAME group motor, not a second boss duel. */
  readonly specialAbility?: "grapple-throw";
  /** Real actor resistance, if known (e.g. hero stats); default 10. */
  readonly agility?: number;
}

export interface CombatBounds {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
}
export interface CombatObstacle extends CombatBounds { readonly id: string }
export interface GroupCombatOptions {
  readonly actors: readonly CombatantSpec[];
  readonly bounds: CombatBounds;
  readonly obstacles?: readonly CombatObstacle[];
}

export interface GroupActor extends CombatActorRuntime<GroupPhase> {
  readonly role: GroupRole;
  readonly style: AttackStyle;
  readonly damage: number;
  readonly armor: number;
  readonly speed: number;
  readonly reach: number;
  readonly radius: number;
  readonly meleeAbility: "ordinary" | "heavy";
  readonly specialAbility?: "grapple-throw";
  readonly agility: number;
  lockedHeading: number;
  attacksStarted: number;
  activeMeleeAbility: "ordinary" | "heavy" | "grapple";
  grappleTargetId: string | null;
  grabbedById: string | null;
  throwVelocity: Point2;
  targetId: string | null;
  rollX: number; rollZ: number;
  healCharges: number;
  distanceTraveled: number;
}

export type GroupCueKind = "attack" | "cast" | "projectile" | "hit" |
  "miss" | "dodge" | "parry" | "heal" | "death" | "blocked" |
  "grab" | "throw" | "landing" | "escape";
export interface GroupCombatCue {
  readonly t: number;
  readonly actorId: string;
  readonly kind: GroupCueKind;
  readonly targetId?: string;
  readonly amount?: number;
}
export interface GroupProjectile {
  readonly ownerId: string;
  readonly team: CombatTeam;
  x: number; z: number;
  vx: number; vz: number;
  readonly damage: number;
  ttl: number;
}

export interface GroupCombatState {
  readonly actors: GroupActor[];
  readonly bounds: CombatBounds;
  readonly obstacles: readonly CombatObstacle[];
  readonly projectiles: GroupProjectile[];
  readonly events: GroupCombatCue[];
  time: number;
  outcome: GroupOutcome;
}

export interface GroupReplayFrame {
  readonly t: number;
  readonly actors: readonly {
    readonly id: string; readonly x: number; readonly z: number;
    readonly hp: number; readonly stamina: number;
    readonly heading: number; readonly phase: GroupPhase;
  }[];
  readonly projectiles: readonly {
    readonly ownerId: string; readonly x: number; readonly z: number;
  }[];
}
export interface GroupCombatReplay {
  readonly version: 1;
  readonly actors: readonly CombatantSpec[];
  readonly bounds: CombatBounds;
  readonly obstacles: readonly CombatObstacle[];
  readonly frames: readonly GroupReplayFrame[];
  readonly cues: readonly GroupCombatCue[];
  readonly outcome: Exclude<GroupOutcome, "fighting">;
}
const round = (n: number) => Math.round(n * 1000) / 1000;
const distance = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.z - a.z);


function validNumber(n: number, min: number, max: number, path: string) {
  if (!Number.isFinite(n) || n < min || n > max) throw new RangeError(path + " is out of range");
}
function validateBounds(b: CombatBounds): void {
  for (const [key, val] of Object.entries(b)) validNumber(val, -10000, 10000, "bounds." + key);
  if (b.maxX - b.minX < 4 || b.maxZ - b.minZ < 4)
    throw new RangeError("Combat area must be at least 4 x 4 units");
}
function within(a: Point2, b: CombatBounds, radius = 0): boolean {
  return a.x >= b.minX + radius && a.x <= b.maxX - radius &&
    a.z >= b.minZ + radius && a.z <= b.maxZ - radius;
}
function insideObstacle(p: Point2, obstacle: CombatObstacle, radius: number): boolean {
  return p.x > obstacle.minX - radius && p.x < obstacle.maxX + radius &&
    p.z > obstacle.minZ - radius && p.z < obstacle.maxZ + radius;
}

export function createGroupCombat(options: GroupCombatOptions): GroupCombatState {
  validateBounds(options.bounds);
  if (options.actors.length < 2 || options.actors.length > 24)
    throw new RangeError("Group combat requires 2-24 actors");
  const ids = new Set<string>();
  const teams = new Set<CombatTeam>();
  const obstacles = [...(options.obstacles ?? [])];
  const obstacleIds = new Set<string>();
  for (const o of obstacles) {
    for (const [key, val] of Object.entries(o))
      if (key !== "id") validNumber(val as number, -10000, 10000, "obstacle." + key);
    if (o.minX >= o.maxX || o.minZ >= o.maxZ)
      throw new RangeError("Obstacle dimensions must be positive");
    if (!o.id || obstacleIds.has(o.id)) throw new Error("Duplicate/empty obstacle ID");
    obstacleIds.add(o.id);
    if (!within({x:o.minX,z:o.minZ}, options.bounds) ||
      !within({x:o.maxX,z:o.maxZ}, options.bounds))
      throw new RangeError("Obstacle must fit within combat bounds");
  }
  const actors = [...options.actors].sort((a, b) => a.id.localeCompare(b.id)).map(spec => {
    if (!spec.id || ids.has(spec.id)) throw new Error("Duplicate/empty combatant ID");
    ids.add(spec.id);
    teams.add(spec.team);
    if (spec.team !== "heroes" && spec.team !== "monsters")
      throw new RangeError("Invalid team");
    if (!["tank","DPS","healer","monster"].includes(spec.role) ||
        !["melee","ranged"].includes(spec.style))
      throw new RangeError("Invalid role/style");
    validNumber(spec.maxHp, 1, 100000, spec.id + ".maxHp");
    validNumber(spec.hp, 0.001, spec.maxHp, spec.id + ".hp");
    validNumber(spec.damage, 1, 10000, spec.id + ".damage");
    validNumber(spec.armor, 0, 10000, spec.id + ".armor");
    validNumber(spec.speed, 0, 30, spec.id + ".speed");
    validNumber(spec.reach, 0.5, 30, spec.id + ".reach");
    if(spec.meleeAbility!==undefined &&
      (spec.meleeAbility!=="heavy" || spec.style!=="melee"))
      throw new RangeError("meleeAbility requires a supported melee skill");
    if(spec.specialAbility!==undefined &&
      (spec.specialAbility!=="grapple-throw" ||
        spec.team!=="monsters"||spec.style!=="melee"))
      throw new RangeError("Grapple ability requires a melee monster");
    const agility=spec.agility??10;
    validNumber(agility,0,1000,spec.id+".agility");
    const radius = spec.radius ?? 0.5;
    validNumber(radius, 0.1, 3, spec.id + ".radius");
    // Healing Herbs are real player-sold consumables. Do not mint two
    // imaginary items simply because an actor's role is healer.
    const healCharges = spec.healCharges ?? 0;
    if (!Number.isSafeInteger(healCharges) || healCharges < 0 || healCharges > 10)
      throw new RangeError("healCharges must be between 0 and 10");
    if (!within(spec, options.bounds, radius) ||
        obstacles.some(o => insideObstacle(spec, o, radius)))
      throw new RangeError("Actor spawns inside a wall or outside arena");
    return {
      id: spec.id, team: spec.team, role: spec.role, style: spec.style,
      maxHp: spec.maxHp, damage: spec.damage, armor: spec.armor,
      speed: spec.speed, reach: spec.reach, radius,
      meleeAbility:chooseCombatAbility(
        [spec.meleeAbility??"ordinary"],1,0,0) as "ordinary"|"heavy",
      ...(spec.specialAbility?{specialAbility:spec.specialAbility}:{}),
      agility,
      attacksStarted:0,activeMeleeAbility:spec.meleeAbility??"ordinary",
      grappleTargetId:null,grabbedById:null,
      throwVelocity:{x:0,z:0},
      x: spec.x, z: spec.z,
      hp: spec.hp, stamina: 100, heading: 0, lockedHeading: 0,
      phase: "move" as GroupPhase, phaseAge: 0, cooldown: 0, applied: false,
      targetId: null, rollX: 0, rollZ: 0, healCharges, distanceTraveled: 0,
    };
  });
  if (teams.size !== 2) throw new RangeError("Both opposing teams are required");
  return {
    actors, bounds: { ...options.bounds }, obstacles: obstacles.map(o => ({...o})),
    projectiles: [], events: [], time: 0, outcome: "fighting",
  };
}

function lineClear(s: GroupCombatState, a: Point2, b: Point2): boolean {
  return !s.obstacles.some(o => combatSegmentBox(a, b, o) !== null);
}
function movementAllowed(s: GroupCombatState, a: GroupActor, x: number, z: number): boolean {
  return within({x,z}, s.bounds, a.radius) &&
    !s.obstacles.some(o => insideObstacle({x,z}, o, a.radius)) &&
    !s.actors.some(other => other !== a && other.hp > 0 &&
      Math.hypot(x - other.x, z - other.z) < a.radius + other.radius - 0.02);
}
function move(s: GroupCombatState, a: GroupActor, dx: number, dz: number): void {
  const result=moveCombatant(a,{x:dx,z:dz},{
    kind:"walkable",
    canOccupy:p=>movementAllowed(s,a,p.x,p.z),
  });
  a.x=result.x;a.z=result.z;
  a.distanceTraveled+=result.distance;
}
function phase(a: GroupActor, next: GroupPhase): void {
  enterCombatActorPhase(a,next);
}
function cue(batch: GroupCombatCue[], s: GroupCombatState, actor: GroupActor,
  kind: GroupCueKind, targetId?: string, amount?: number): void {
  batch.push({ t: round(s.time), actorId: actor.id, kind,
    ...(targetId ? { targetId } : {}),
    ...(amount !== undefined ? { amount } : {}) });
}
function closestEnemy(s: GroupCombatState, actor: GroupActor): GroupActor | null {
  return selectCombatTarget(actor,s.actors);
}
function healingTarget(s: GroupCombatState, actor: GroupActor): GroupActor | null {
  if (actor.healCharges <= 0 || actor.hp <= 0) return null;
  // Any hero may spend a purchased Herb on their own wounds.
  // Healers can also treat an injured teammate without transferring
  // phantom items between inventories.
  if (actor.role !== "healer")
    return actor.hp < actor.maxHp * 0.60 ? actor : null;
  const candidates = s.actors.filter(other =>
    other.team === actor.team && other.hp > 0 &&
    other.hp < other.maxHp * 0.68 && distance(actor, other) <= 9);
  candidates.sort((a,b) =>
    a.hp/a.maxHp - b.hp/b.maxHp || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}
function attackerThreat(s: GroupCombatState, defender: GroupActor): GroupActor | null {
  return s.actors.find(other =>
    other.team !== defender.team && other.hp > 0 &&
    other.phase === "windup" &&
    other.phaseAge >= (other.meleeAbility==="heavy"
      ? meleeAbilityProfile("heavy").windupSeconds +
        meleeAbilityProfile("heavy").strikeDelaySeconds - 0.28
      : 0.38) &&
    distance(other, defender) < other.reach + defender.radius + 0.8 +
      (other.meleeAbility==="heavy"?0.35:0) &&
    inAttackArc(other, other.lockedHeading, defender,
      other.reach + defender.radius + 1 +
        (other.meleeAbility==="heavy"?0.35:0), 1.1)) ?? null;
}
function tryStrike(s: GroupCombatState, attacker: GroupActor,
  batch: GroupCombatCue[]): void {
  const target = s.actors.find(a => a.id === attacker.targetId && a.hp > 0);
  if (!target) {
    cue(batch,s,attacker,"miss",attacker.targetId ?? undefined);
    return;
  }
  const skill=meleeAbilityProfile(attacker.meleeAbility,
    attacker.reach+target.radius);
  const contact=resolveMeleeContact({
    attacker,lockedHeading:attacker.lockedHeading,defender:target,
    defenderHeading:target.heading,defenderPhase:target.phase,
    defenderPhaseAge:target.phaseAge,ability:skill,
    lineClear:lineClear(s,attacker,target),
  });
  if(contact==="miss"){
    cue(batch,s,attacker,"miss",target.id);return;
  }
  if(contact==="dodge"){
    cue(batch,s,target,"dodge",attacker.id);return;
  }
  if(contact==="parry"){
    cue(batch,s,target,"parry",attacker.id);
    phase(attacker,"hurt");
    attacker.cooldown=Math.max(attacker.cooldown,0.45);
    return;
  }
  applyDamage(s,attacker,target,batch,skill.damageMultiplier);
}
function applyDamage(s: GroupCombatState, attacker: GroupActor, target: GroupActor,
  batch: GroupCombatCue[], multiplier=1): void {
  const hit=applyCombatHit(target.hp,Math.round(attacker.damage*multiplier),target.armor);
  const dealt=hit.amount;
  target.hp=hit.hp;
  cue(batch,s,attacker,"hit",target.id,dealt);
  if (target.hp === 0) { phase(target,"dead"); cue(batch,s,target,"death",attacker.id); }
  else phase(target,"hurt");
}

function updateActor(s: GroupCombatState, a: GroupActor, dt: number, batch: GroupCombatCue[]): void {
  if (a.hp <= 0) return;
  refreshCombatActorResources(a,dt,17);
  // This is the same action clock used by the boss. Ability profiles
  // decide when contact can happen, not each renderer's animation time.
  let window:CombatActionWindow={};
  if(a.phase==="windup"){
    window={completeAt:meleeAbilityProfile(a.meleeAbility,a.reach).windupSeconds};
  }else if(a.phase==="strike"){
    const skill=meleeAbilityProfile(a.meleeAbility,a.reach);
    window={contactAt:skill.strikeDelaySeconds,completeAt:skill.strikeEndSeconds};
  }else if(a.phase==="cast"){
    window={contactAt:0.40,completeAt:0.75};
  }else if(a.phase==="heal"){
    window={contactAt:0.62,completeAt:0.92};
  }else if(a.phase==="recover")window={completeAt:0.38};
  else if(a.phase==="roll"||a.phase==="parry")window={completeAt:0.53};
  else if(a.phase==="hurt")window={completeAt:0.34};
  const tick=advanceCombatActorPhase(a,dt,window);
  const enemy = closestEnemy(s, a);
  if (!enemy) return;
  if (a.phase === "move") {
    a.heading = combatHeading(a,enemy);
    const threat = attackerThreat(s,a);
    const reaction=chooseCombatDefense({
      threatened:!!threat,stamina:a.stamina,
      preferParry:a.role==="tank"&&a.style==="melee",
      canParry:a.role==="tank"&&a.style==="melee",
    });
    if(threat&&reaction==="parry"){
      a.stamina-=20;
      a.heading=combatHeading(a,threat);
      phase(a,"parry");
    }else if(threat&&reaction==="roll"){
      a.stamina-=28;
      const escape=combatDirection(threat,a);
      const sign=a.id.localeCompare(threat.id)<0?1:-1;
      a.rollX=-escape.z*sign;a.rollZ=escape.x*sign;
      phase(a,"roll");
    }
    const friend = healingTarget(s,a);
    if (a.phase === "move" && friend && a.stamina >= 18) {
      a.stamina -= 18; a.targetId = friend.id; phase(a,"heal");
    }
    if (a.phase === "move") {
      const gap=distance(a,enemy);
      const ranged=a.style==="ranged";
      const posture=chooseCombatPosture({
        distance:gap,ready:a.cooldown===0&&a.stamina>=13,
        clearShot:lineClear(s,a,enemy),
        attackRange:ranged?11:a.reach+enemy.radius,
        approachBeyond:(ranged?7:a.reach+enemy.radius-0.35)+0.15,
        ...(ranged?{withdrawWithin:4.5}:{}),
      });
      if(posture.attack){
        a.stamina-=13;a.targetId=enemy.id;
        a.lockedHeading=a.heading;
        a.cooldown=ranged?1.3:
          a.meleeAbility==="heavy"?1.62:(a.role==="DPS"?0.92:1.16);
        phase(a,ranged?"cast":"windup");
        cue(batch,s,a,ranged?"cast":"attack",enemy.id);
      }else{
        const heading=combatDirection(a,enemy);
        if(posture.approach)move(s,a,heading.x*a.speed*dt,heading.z*a.speed*dt);
        else if(posture.withdraw)move(s,a,-heading.x*a.speed*dt,-heading.z*a.speed*dt);
      }
    }
  } else if (a.phase === "windup") {
    if (tick.complete) phase(a,"strike");
  } else if (a.phase === "strike") {
    if (tick.contactDue) {
      a.applied = true;
      tryStrike(s,a,batch);
    }
    if (a.phase === "strike" && tick.complete)
      phase(a,"recover");
  } else if (a.phase === "cast") {
    if (tick.contactDue) {
      a.applied = true;
      const target = s.actors.find(other => other.id === a.targetId && other.hp > 0);
      if (target) {
        const d = combatDirection(a,target);
        s.projectiles.push({
          ownerId:a.id,team:a.team,x:a.x,z:a.z,
          vx:d.x*12,vz:d.z*12,damage:a.damage,ttl:1.6,
        });
        cue(batch,s,a,"projectile",target.id);
      }
    }
    if (tick.complete) phase(a,"move");
  } else if (a.phase === "recover") {
    if (tick.complete) phase(a,"move");
  } else if (a.phase === "roll") {
    move(s,a,a.rollX*7.8*dt,a.rollZ*7.8*dt);
    if (tick.complete) phase(a,"move");
  } else if (a.phase === "parry") {
    if (a.phaseAge >= 0.53) phase(a,"move");
  } else if (a.phase === "hurt") {
    if (tick.complete) phase(a,"move");
  } else if (a.phase === "heal") {
    if (tick.contactDue) {
      a.applied = true;
      const friend = s.actors.find(other => other.id === a.targetId &&
        other.team === a.team && other.hp > 0);
      if (friend && a.healCharges > 0 && distance(a,friend) <= 9) {
        const heal=applyCombatHealing(friend.hp,friend.maxHp,HEALING_HERB_HP);
        if (heal.amount>0) {
          friend.hp=heal.hp;
          a.healCharges--;
          cue(batch,s,a,"heal",friend.id,heal.amount);
        }
      }
    }
    if (tick.complete) phase(a,"move");
  }
}
function updateProjectiles(s: GroupCombatState, dt: number, batch: GroupCombatCue[]) {
  const remaining: GroupProjectile[] = [];
  for (const p of s.projectiles) {
    if (p.ttl <= 0) continue;
    // Both Boss and group projectiles use this physically swept trace.
    // Only enemies are eligible, so no accidental friendly-fire invention.
    const trace=traceCombatProjectile(
      p,{x:p.vx*dt,z:p.vz*dt},
      s.actors.filter(a=>a.team!==p.team&&a.hp>0).map(a=>({
        id:a.id,x:a.x,z:a.z,radius:a.radius+0.18,
      })),
      s.obstacles,
    );
    if(trace.blocked){
      p.ttl=0;
      const owner=s.actors.find(a=>a.id===p.ownerId)!;
      cue(batch,s,owner,"blocked");
    }else if(trace.hitId!==null){
      p.ttl=0;
      const owner=s.actors.find(a=>a.id===p.ownerId)!;
      const victim=s.actors.find(a=>a.id===trace.hitId)!;
      applyDamage(s,owner,victim,batch);
    }else{
      p.x=trace.end.x;p.z=trace.end.z;p.ttl-=dt;
      if(p.ttl>0&&within(trace.end,s.bounds))remaining.push(p);
    }
  }
  s.projectiles.splice(0,s.projectiles.length,...remaining);
}

/**
 * The ordinary dungeon actor behaviors plug into the SAME encounter frame
 * driver as boss hero/grapple actions. Canonical actor ordering is set
 * when the group is created, not when its viewer loads a replay.
 */
const GROUP_PIPELINE: EncounterPipeline<GroupCombatState,GroupActor,GroupCombatCue>={
  actors:state=>state.actors,
  updateActor:(state,actor,dt,frame)=>updateActor(state,actor,dt,frame.cues),
  projectiles:(state,dt,frame)=>updateProjectiles(state,dt,frame.cues),
  finish:state=>{
    state.outcome=encounterTeamOutcome(state.actors);
  },
  commit:(state,frame)=>{
    state.events.push(...frame.cues);
  },
};

/** Authoritative 60 Hz gameplay, never executed while watching a recording. */
export function stepGroupCombat(
  s:GroupCombatState,dt=COMBAT_STEP_SECONDS,
):readonly GroupCombatCue[] {
  return stepCombatEncounter(s,dt,GROUP_PIPELINE);
}
function capture(s: GroupCombatState): GroupReplayFrame {
  return { t:round(s.time),
    actors:s.actors.map(a=>({
      id:a.id,x:round(a.x),z:round(a.z),
      hp:round(a.hp),stamina:round(a.stamina),
      heading:round(a.heading),phase:a.phase,
    })),
    projectiles:s.projectiles.map(p=>({ownerId:p.ownerId,x:round(p.x),z:round(p.z)})),
  };
}

/**
 * A bounded, side-effect-free recording for future dungeon replay support.
 * The caller owns any day-tick integration and save validation in a later MVP.
 */
export function resolveGroupCombat(options: GroupCombatOptions, maxSeconds=45):
  { readonly state: GroupCombatState; readonly replay: GroupCombatReplay } {
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 90)
    throw new RangeError("Group encounters must be bounded to 1-90 seconds");
  const state=createGroupCombat(options);
  const {frames}=recordCombatEncounter({
    state,step:stepGroupCombat,capture, captureEvery:6,maxSeconds,
    isFighting:world=>world.outcome==="fighting",
  });
  if(state.outcome==="fighting")state.outcome="draw";
  return {state,replay:{
    version:1,
    actors:options.actors.map(a=>({...a})),
    bounds:{...options.bounds},
    obstacles:(options.obstacles??[]).map(o=>({...o})),
    frames,cues:[...state.events],
    outcome:state.outcome,
  }};
}
