import { inAttackArc, parryActive, rollInvulnerable, type Point2 } from "./combatGeometry.ts";

/**
 * MVP 1.2b: a deterministic, render-independent multi-actor encounter motor.
 * Future dungeon exploration supplies positions and an arena. Neither this
 * module nor its replay ever mutates the merchant GameState or browser scene.
 * The existing Level-6 duel is intentionally retained as a compatibility path.
 */
export type CombatTeam = "heroes" | "monsters";
export type GroupRole = "tank" | "DPS" | "healer" | "monster";
export type AttackStyle = "melee" | "ranged";
export type GroupPhase = "move" | "windup" | "strike" | "recover" |
  "cast" | "heal" | "roll" | "parry" | "hurt" | "dead";
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

export interface GroupActor {
  readonly id: string;
  readonly team: CombatTeam;
  readonly role: GroupRole;
  readonly style: AttackStyle;
  readonly maxHp: number;
  readonly damage: number;
  readonly armor: number;
  readonly speed: number;
  readonly reach: number;
  readonly radius: number;
  x: number; z: number;
  hp: number; stamina: number;
  heading: number; lockedHeading: number;
  phase: GroupPhase; phaseAge: number;
  cooldown: number; applied: boolean;
  targetId: string | null;
  rollX: number; rollZ: number;
  healCharges: number;
  distanceTraveled: number;
}

export type GroupCueKind = "attack" | "cast" | "projectile" | "hit" |
  "miss" | "dodge" | "parry" | "heal" | "death" | "blocked";
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
const STEP = 1 / 60;
const round = (n: number) => Math.round(n * 1000) / 1000;
const distance = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.z - a.z);
const direction = (a: Point2, b: Point2) => {
  const d = distance(a, b);
  return d > 0.000001 ? { x: (b.x - a.x) / d, z: (b.z - a.z) / d } : { x: 0, z: 1 };
};
const face = (a: Point2, b: Point2) => Math.atan2(b.x - a.x, b.z - a.z);

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
    validateBounds({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ });
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
    const radius = spec.radius ?? 0.5;
    validNumber(radius, 0.1, 3, spec.id + ".radius");
    const healCharges = spec.healCharges ?? (spec.role === "healer" ? 2 : 0);
    if (!Number.isSafeInteger(healCharges) || healCharges < 0 || healCharges > 10)
      throw new RangeError("healCharges must be between 0 and 10");
    if (!within(spec, options.bounds, radius) ||
        obstacles.some(o => insideObstacle(spec, o, radius)))
      throw new RangeError("Actor spawns inside a wall or outside arena");
    return {
      id: spec.id, team: spec.team, role: spec.role, style: spec.style,
      maxHp: spec.maxHp, damage: spec.damage, armor: spec.armor,
      speed: spec.speed, reach: spec.reach, radius, x: spec.x, z: spec.z,
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

/** Segment-to-AABB entry time, used for both projectiles and line of sight. */
function segmentBox(a: Point2, b: Point2, box: CombatBounds, padding = 0): number | null {
  let near = 0, far = 1;
  for (const [axis, lo, hi] of [
    ["x", box.minX - padding, box.maxX + padding],
    ["z", box.minZ - padding, box.maxZ + padding],
  ] as const) {
    const p = a[axis], delta = b[axis] - p;
    if (Math.abs(delta) < 1e-9) {
      if (p < lo || p > hi) return null;
    } else {
      const t1 = (lo - p) / delta, t2 = (hi - p) / delta;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) return null;
    }
  }
  return near;
}
function segmentCircle(a: Point2, b: Point2, center: Point2, radius: number): number | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  const ox = a.x - center.x, oz = a.z - center.z;
  const aa = dx * dx + dz * dz;
  if (aa < 1e-12) return ox * ox + oz * oz <= radius * radius ? 0 : null;
  const bb = 2 * (ox * dx + oz * dz);
  const cc = ox * ox + oz * oz - radius * radius;
  if (cc <= 0) return 0;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
function lineClear(s: GroupCombatState, a: Point2, b: Point2): boolean {
  return !s.obstacles.some(o => segmentBox(a, b, o) !== null);
}
function movementAllowed(s: GroupCombatState, a: GroupActor, x: number, z: number): boolean {
  return within({x,z}, s.bounds, a.radius) &&
    !s.obstacles.some(o => insideObstacle({x,z}, o, a.radius)) &&
    !s.actors.some(other => other !== a && other.hp > 0 &&
      Math.hypot(x - other.x, z - other.z) < a.radius + other.radius - 0.02);
}
function move(s: GroupCombatState, a: GroupActor, dx: number, dz: number): void {
  const oldX = a.x, oldZ = a.z;
  const x = oldX + dx, z = oldZ + dz;
  // Sliding allows movement along walls; no teleporting through solid tiles.
  if (movementAllowed(s, a, x, z)) { a.x = x; a.z = z; }
  else {
    if (movementAllowed(s, a, x, oldZ)) a.x = x;
    if (movementAllowed(s, a, a.x, z)) a.z = z;
  }
  a.distanceTraveled += Math.hypot(a.x-oldX, a.z-oldZ);
}
function phase(a: GroupActor, next: GroupPhase): void {
  a.phase = next;
  a.phaseAge = 0;
  a.applied = false;
}
function cue(batch: GroupCombatCue[], s: GroupCombatState, actor: GroupActor,
  kind: GroupCueKind, targetId?: string, amount?: number): void {
  batch.push({ t: round(s.time), actorId: actor.id, kind,
    ...(targetId ? { targetId } : {}),
    ...(amount !== undefined ? { amount } : {}) });
}
function closestEnemy(s: GroupCombatState, actor: GroupActor): GroupActor | null {
  let best: GroupActor | null = null, score = Infinity;
  for (const other of s.actors) {
    if (other.team === actor.team || other.hp <= 0) continue;
    // Monsters slightly favor tanks, without locking targeting permanently.
    const candidate = distance(actor, other) -
      (actor.team === "monsters" && other.role === "tank" ? 0.65 : 0);
    if (candidate < score - 1e-8) { score = candidate; best = other; }
  }
  return best;
}
function healingTarget(s: GroupCombatState, actor: GroupActor): GroupActor | null {
  if (actor.role !== "healer" || actor.healCharges <= 0) return null;
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
    other.phase === "windup" && other.phaseAge >= 0.38 &&
    distance(other, defender) < other.reach + defender.radius + 0.8 &&
    inAttackArc(other, other.lockedHeading, defender,
      other.reach + defender.radius + 1, 1.1)) ?? null;
}
function tryStrike(s: GroupCombatState, attacker: GroupActor,
  batch: GroupCombatCue[]): void {
  const target = s.actors.find(a => a.id === attacker.targetId && a.hp > 0);
  if (!target || !inAttackArc(attacker, attacker.lockedHeading, target,
    attacker.reach + target.radius, 0.91) || !lineClear(s, attacker, target)) {
    cue(batch,s,attacker,"miss",attacker.targetId ?? undefined);
    return;
  }
  if (target.phase === "roll" && rollInvulnerable(target.phaseAge)) {
    cue(batch,s,target,"dodge",attacker.id); return;
  }
  if (target.phase === "parry" && parryActive(target.phaseAge) &&
      inAttackArc(target, target.heading, attacker, 4.0, 1.25)) {
    cue(batch,s,target,"parry",attacker.id);
    phase(attacker,"hurt");
    attacker.cooldown = Math.max(attacker.cooldown, 0.45);
    return;
  }
  applyDamage(s, attacker, target, batch);
}
function applyDamage(s: GroupCombatState, attacker: GroupActor, target: GroupActor,
  batch: GroupCombatCue[]): void {
  const dealt = Math.min(target.hp, Math.max(1, attacker.damage - target.armor));
  target.hp = Math.max(0, target.hp - dealt);
  cue(batch,s,attacker,"hit",target.id,dealt);
  if (target.hp === 0) { phase(target,"dead"); cue(batch,s,target,"death",attacker.id); }
  else phase(target,"hurt");
}

function updateActor(s: GroupCombatState, a: GroupActor, dt: number, batch: GroupCombatCue[]): void {
  if (a.hp <= 0) return;
  a.stamina = Math.min(100, a.stamina + 17 * dt);
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.phaseAge += dt;
  const enemy = closestEnemy(s, a);
  if (!enemy) return;
  if (a.phase === "move") {
    a.heading = face(a,enemy);
    const threat = attackerThreat(s,a);
    if (threat && a.stamina >= 20 && a.role === "tank" && a.style === "melee") {
      a.stamina -= 20;
      a.heading = face(a, threat);
      phase(a,"parry");
    } else if (threat && a.stamina >= 28) {
      a.stamina -= 28;
      const escape = direction(threat,a);
      const sign = a.id.localeCompare(threat.id) < 0 ? 1 : -1;
      a.rollX = -escape.z * sign;
      a.rollZ = escape.x * sign;
      phase(a,"roll");
    }
    const friend = healingTarget(s,a);
    if (a.phase === "move" && friend && a.stamina >= 18) {
      a.stamina -= 18; a.targetId = friend.id; phase(a,"heal");
    }
    if (a.phase === "move") {
      const gap = distance(a,enemy);
      const ranged = a.style === "ranged";
      const reach = ranged ? 11 : a.reach + enemy.radius;
      if (a.cooldown === 0 && gap <= reach && a.stamina >= 13 &&
        lineClear(s,a,enemy)) {
        a.stamina -= 13; a.targetId = enemy.id;
        a.lockedHeading = a.heading;
        a.cooldown = ranged ? 1.3 : (a.role === "DPS" ? 0.92 : 1.16);
        phase(a,ranged ? "cast" : "windup");
        cue(batch,s,a,ranged ? "cast" : "attack",enemy.id);
      } else {
        const desired = ranged ? 7 : a.reach + enemy.radius - 0.35;
        const heading = direction(a,enemy);
        if (gap > desired + 0.15) move(s,a,heading.x*a.speed*dt,heading.z*a.speed*dt);
        else if (ranged && gap < 4.5) move(s,a,-heading.x*a.speed*dt,-heading.z*a.speed*dt);
      }
    }
  } else if (a.phase === "windup") {
    if (a.phaseAge >= 0.62) phase(a,"strike");
  } else if (a.phase === "strike") {
    if (a.phaseAge >= 0.16 && !a.applied) {
      a.applied = true;
      tryStrike(s,a,batch);
    }
    if (a.phase === "strike" && a.phaseAge >= 0.33) phase(a,"recover");
  } else if (a.phase === "cast") {
    if (a.phaseAge >= 0.40 && !a.applied) {
      a.applied = true;
      const target = s.actors.find(other => other.id === a.targetId && other.hp > 0);
      if (target) {
        const d = direction(a,target);
        s.projectiles.push({
          ownerId:a.id,team:a.team,x:a.x,z:a.z,
          vx:d.x*12,vz:d.z*12,damage:a.damage,ttl:1.6,
        });
        cue(batch,s,a,"projectile",target.id);
      }
    }
    if (a.phaseAge >= 0.75) phase(a,"move");
  } else if (a.phase === "recover") {
    if (a.phaseAge >= 0.38) phase(a,"move");
  } else if (a.phase === "roll") {
    move(s,a,a.rollX*7.8*dt,a.rollZ*7.8*dt);
    if (a.phaseAge >= 0.53) phase(a,"move");
  } else if (a.phase === "parry") {
    if (a.phaseAge >= 0.53) phase(a,"move");
  } else if (a.phase === "hurt") {
    if (a.phaseAge >= 0.34) phase(a,"move");
  } else if (a.phase === "heal") {
    if (a.phaseAge >= 0.62 && !a.applied) {
      a.applied = true;
      const friend = s.actors.find(other => other.id === a.targetId &&
        other.team === a.team && other.hp > 0);
      if (friend && a.healCharges > 0 && distance(a,friend) <= 9) {
        const restored = Math.min(friend.maxHp-friend.hp, 20);
        friend.hp += restored;
        a.healCharges--;
        cue(batch,s,a,"heal",friend.id,restored);
      }
    }
    if (a.phaseAge >= 0.92) phase(a,"move");
  }
}
function updateProjectiles(s: GroupCombatState, dt: number, batch: GroupCombatCue[]) {
  const remaining: GroupProjectile[] = [];
  for (const p of s.projectiles) {
    if (p.ttl <= 0) continue;
    const start={x:p.x,z:p.z};
    const end={x:p.x+p.vx*dt,z:p.z+p.vz*dt};
    let impact=Infinity, victim: GroupActor | null = null;
    const wallT = s.obstacles.reduce((min,o) =>
      Math.min(min,segmentBox(start,end,o) ?? Infinity),Infinity);
    for (const a of s.actors) {
      if (a.team === p.team || a.hp <= 0) continue;
      const t=segmentCircle(start,end,a,a.radius+0.18);
      if (t !== null && t < impact) { impact=t; victim=a; }
    }
    if (wallT <= impact && wallT <= 1) {
      p.ttl=0;
      const owner=s.actors.find(a=>a.id===p.ownerId)!;
      cue(batch,s,owner,"blocked");
    } else if (victim && impact <= 1) {
      p.ttl=0;
      const owner=s.actors.find(a=>a.id===p.ownerId)!;
      // Ranged hits never damage their own team.
      applyDamage(s,owner,victim,batch);
    } else {
      p.x=end.x; p.z=end.z; p.ttl-=dt;
      if (p.ttl>0 && within(end,s.bounds)) remaining.push(p);
    }
  }
  s.projectiles.splice(0,s.projectiles.length,...remaining);
}

/** All authoritative results derive exclusively from physical actions, at 60 Hz. */
export function stepGroupCombat(s: GroupCombatState, dt=STEP): readonly GroupCombatCue[] {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
    throw new RangeError("Combat step must be within (0, 0.1] seconds");
  if (s.outcome !== "fighting") return [];
  s.time+=dt;
  const batch: GroupCombatCue[]=[];
  // Canonical order means input array iteration cannot change results.
  for (const actor of s.actors) updateActor(s,actor,dt,batch);
  updateProjectiles(s,dt,batch);
  const heroes=s.actors.some(a=>a.team==="heroes" && a.hp>0);
  const monsters=s.actors.some(a=>a.team==="monsters" && a.hp>0);
  if (!heroes || !monsters)
    s.outcome = heroes ? "heroes" : monsters ? "monsters" : "draw";
  s.events.push(...batch);
  return batch;
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
  const frames:GroupReplayFrame[]=[capture(state)];
  for(let i=1;i<=maxSeconds*60 && state.outcome==="fighting";i++) {
    stepGroupCombat(state,STEP);
    if(i%6===0 || state.outcome!=="fighting") frames.push(capture(state));
  }
  if(state.outcome==="fighting") state.outcome="draw";
  return {state,replay:{
    version:1,
    actors:options.actors.map(a=>({...a})),
    bounds:{...options.bounds},
    obstacles:(options.obstacles??[]).map(o=>({...o})),
    frames,cues:[...state.events],
    outcome:state.outcome,
  }};
}
