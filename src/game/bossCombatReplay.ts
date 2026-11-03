import {
  BOSS_MAX_HP, createCombatPreview, stepCombatPreview,
  type ActorPhase, type BossPhase, type ArenaCue, type CombatPreviewOptions,
  type CombatPreviewState,
} from "./arenaCombatMotion.ts";

export const REPLAY_FORMAT = 1;
export const REPLAY_MAX_FRAMES = 700;
export const REPLAY_MAX_SECONDS = 90;
export const REPLAY_KEEP_RECENT = 3;
const STEP = 1 / 60;
const CAPTURE_EVERY = 8;

/** Minimal snapshots of the *authoritative* spatial simulation, not rerolled video. */
export interface BossReplayFrame {
  readonly t: number;
  readonly hx: number;
  readonly hz: number;
  readonly bx: number;
  readonly bz: number;
  readonly hh: number;
  readonly bh: number;
  readonly lock: number;
  readonly slam: boolean;
  readonly travel: number;
  readonly heroHp: number;
  readonly bossHp: number;
  readonly stamina: number;
  readonly heroPhase: ActorPhase;
  readonly heroAge: number;
  readonly bossPhase: BossPhase;
  readonly bossAge: number;
  readonly projectiles: readonly (readonly [number, number])[];
  readonly dodgeCount: number;
  readonly parryCount: number;
  readonly landedHits: number;
  readonly missedHits: number;
  readonly cues: readonly ArenaCue[];
}
export type BossReplayOutcome = "victory" | "retreat" | "death";
export interface BossCombatReplay {
  readonly version: 1;
  readonly day: number;
  readonly heroId: string;
  readonly role: "tank" | "healer" | "DPS";
  readonly sword: boolean;
  readonly armor: boolean;
  readonly maxHp: number;
  readonly outcome: BossReplayOutcome;
  readonly frames: readonly BossReplayFrame[];
}

const rounded = (x: number): number => Math.round(x * 1000) / 1000;
export function frameFromCombat(s: CombatPreviewState, cues: readonly ArenaCue[] = []): BossReplayFrame {
  return {
    t: rounded(s.time),
    hx: rounded(s.hero.x), hz: rounded(s.hero.z),
    bx: rounded(s.boss.x), bz: rounded(s.boss.z),
    hh: rounded(s.heroHeading), bh: rounded(s.bossHeading),
    lock: rounded(s.lockedBossHeading), slam: s.bossSlam,
    travel: rounded(s.distanceTraveled),
    heroHp: s.heroHp, bossHp: s.bossHp, stamina: rounded(s.stamina),
    heroPhase: s.heroPhase, heroAge: rounded(s.heroAge),
    bossPhase: s.bossPhase, bossAge: rounded(s.bossAge),
    projectiles: s.projectiles.map(p => [rounded(p.x), rounded(p.z)] as const),
    dodgeCount: s.dodgeCount, parryCount: s.parryCount,
    landedHits: s.landedHits, missedHits: s.missedHits,
    cues: cues.map(c => ({...c})),
  };
}

/** This very same motor runs on the confirmed day tick and generates replay frames. */
export function resolveSpatialBoss(
  heroId: string, day: number, options: CombatPreviewOptions,
): { replay: BossCombatReplay; final: CombatPreviewState } {
  const state = createCombatPreview(options);
  const frames: BossReplayFrame[] = [frameFromCombat(state)];
  let pending: ArenaCue[] = [];
  const ticks = REPLAY_MAX_SECONDS * 60;
  for (let i = 1; i <= ticks && state.outcome === "fighting"; i++) {
    const cues = stepCombatPreview(state, STEP);
    pending.push(...cues);
    if (i % CAPTURE_EVERY === 0 || state.outcome !== "fighting" || i === ticks) {
      frames.push(frameFromCombat(state, pending));
      pending = [];
    }
  }
  const outcome: BossReplayOutcome = state.outcome === "victory" ? "victory" :
    state.outcome === "defeat" ? "death" : "retreat";
  return {
    final: state,
    replay: {version: REPLAY_FORMAT, heroId, day,
      role: options.role, sword: options.sword, armor: options.armor,
      maxHp: options.maxHealth, outcome, frames},
  };
}

/** Strict validation at the save boundary. Replays never execute during load. */
export function validateBossReplay(value: unknown, path: string,
  heroId: string, day: number, outcome: BossReplayOutcome): asserts value is BossCombatReplay {
  const invalid = (detail: string): never => {
    throw new Error("Invalid campaign save: " + path + " " + detail + ".");
  };
  const rec = (raw: unknown, label: string, fields: readonly string[]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid(label + " must be an object");
    const o = raw as Record<string, unknown>;
    if (Object.keys(o).length !== fields.length || fields.some(f => !Object.hasOwn(o, f)))
      invalid(label + " has unknown or missing fields");
    return o;
  };
  const num = (n: unknown, label: string, low: number, high: number): number => {
    if (typeof n !== "number" || !Number.isFinite(n) || n < low || n > high)
      invalid(label + " out of range");
    return n as number;
  };
  const replay = rec(value, "replay", [
    "version","day","heroId","role","sword","armor","maxHp","outcome","frames"]);
  if (replay.version !== REPLAY_FORMAT || replay.day !== day ||
      replay.heroId !== heroId || replay.outcome !== outcome) invalid("identity/outcome mismatch");
  if (!["tank","healer","DPS"].includes(replay.role as string) ||
      typeof replay.sword !== "boolean" || typeof replay.armor !== "boolean")
    invalid("role/gear invalid");
  num(replay.maxHp,"maxHp",1,1000000);
  if (!Array.isArray(replay.frames) || replay.frames.length < 2 ||
      replay.frames.length > REPLAY_MAX_FRAMES) invalid("frame count invalid");
  const frames = replay.frames as unknown[];
  let previous = -1;
  const actor = ["move","roll","parry","attack","cast","heal","hurt","dead"];
  const boss = ["chase","windup","strike","recover","stagger","dead"];
  const cueKinds = ["windup","dodge","parry","miss","hit","hero-hit","projectile",
    "heal","stagger","lava","victory","defeat"];
  for (let i = 0; i < frames.length; i++) {
    const prefix = "frames[" + i + "]";
    const frame = rec(frames[i], prefix, [
      "t","hx","hz","bx","bz","hh","bh","lock","slam","travel",
      "heroHp","bossHp","stamina",
      "heroPhase","heroAge","bossPhase","bossAge","projectiles",
      "dodgeCount","parryCount","landedHits","missedHits","cues",
    ]);
    const t = num(frame.t,prefix+".t",0,REPLAY_MAX_SECONDS);
    if (t <= previous) invalid(prefix+" time must increase");
    previous=t;
    for (const key of ["hx","hz","bx","bz"] as const) num(frame[key], prefix+"."+key,-30,30);
    for (const key of ["hh","bh","lock"] as const) num(frame[key],prefix+"."+key,-7,7);
    if (typeof frame.slam !== "boolean") invalid(prefix+".slam must be boolean");
    num(frame.travel,prefix+".travel",0,100000);
    num(frame.heroHp,prefix+".heroHp",0,replay.maxHp as number);
    num(frame.bossHp,prefix+".bossHp",0,BOSS_MAX_HP);
    num(frame.stamina,prefix+".stamina",0,100);
    num(frame.heroAge,prefix+".heroAge",0,90);
    num(frame.bossAge,prefix+".bossAge",0,90);
    if (!actor.includes(frame.heroPhase as string) || !boss.includes(frame.bossPhase as string))
      invalid(prefix+" invalid combat phase");
    for (const key of ["dodgeCount","parryCount","landedHits","missedHits"] as const) {
      const value = num(frame[key],prefix+"."+key,0,100000);
      if (!Number.isSafeInteger(value)) invalid(prefix+"."+key+" must be integer");
    }
    if (!Array.isArray(frame.projectiles) || frame.projectiles.length > 20)
      invalid(prefix+" projectiles invalid");
    for (const p of frame.projectiles as unknown[]) {
      if (!Array.isArray(p) || p.length !== 2) invalid(prefix+" projectile coords invalid");
      num(p[0],prefix+" projectile.x",-40,40);
      num(p[1],prefix+" projectile.z",-40,40);
    }
    if (!Array.isArray(frame.cues) || frame.cues.length > 30)
      invalid(prefix+" cues invalid");
    for (const c of frame.cues as unknown[]) {
      if (!c || typeof c !== "object" || Array.isArray(c)) invalid(prefix+" cue invalid");
      const o=c as Record<string,unknown>;
      if (!cueKinds.includes(o.kind as string) ||
          Object.keys(o).some(k=>k!=="kind"&&k!=="amount")) invalid(prefix+" cue kind invalid");
      if (o.amount !== undefined) num(o.amount,prefix+" cue.amount",0,100000);
    }
  }
  const last = frames.at(-1) as BossReplayFrame;
  if (outcome === "victory" && last.bossHp !== 0) invalid("victory without boss death");
  if (outcome === "death" && last.heroHp !== 0) invalid("death without hero death");
  if (outcome === "retreat" && (last.heroHp <= 0 || last.bossHp <= 0))
    invalid("retreat needs two living actors");
}
