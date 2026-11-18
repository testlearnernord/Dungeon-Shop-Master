import type { Point2 } from "./combatGeometry.ts";
import {
  tickCombatAction, tickCombatCooldown, regenerateCombatStamina,
  type CombatActionTick, type CombatActionWindow,
} from "./combatActionClock.ts";

/**
 * Actual mutable actor state used by ALL encounter types.
 * GroupActor implements this interface directly. Unique scripted bosses can
 * expose a live view over their legacy state fields; do not duplicate state,
 * copy HP into a parallel actor registry or mutate saved replay frames.
 */
export interface CombatActorRuntime<Phase extends string = string> extends Point2 {
  readonly id: string;
  readonly team: "heroes" | "monsters";
  readonly maxHp: number;
  hp: number;
  stamina: number;
  heading: number;
  phase: Phase;
  phaseAge: number;
  cooldown: number;
  applied: boolean;
}

/** Purely a state transition. Animations are consumers of the new phase,
 * never an alternative gameplay authority. */
export function enterCombatActorPhase<Phase extends string>(
  actor: CombatActorRuntime<Phase>, next: Phase,
): void {
  actor.phase=next;
  actor.phaseAge=0;
  actor.applied=false;
}

/** The shared phase clock updates the SAME actor that is in combat.
 * Contact remains at most once per phase and its window comes from
 * the real ability profile. */
export function advanceCombatActorPhase<Phase extends string>(
  actor: CombatActorRuntime<Phase>, dt: number,
  window: CombatActionWindow = {},
): CombatActionTick {
  const tick=tickCombatAction(actor.phaseAge,dt,actor.applied,window);
  actor.phaseAge=tick.age;
  return tick;
}

/** Advance resource clocks at their existing authoritative encounter stage.
 * The group uses this per-actor; boss heroes use it in the tactical
 * beforeActors phase, so old attack and dodge timings stay unchanged. */
export function refreshCombatActorResources<Phase extends string>(
  actor: CombatActorRuntime<Phase>, dt: number, staminaPerSecond: number,
): void {
  const stamina=regenerateCombatStamina(actor.stamina,dt,staminaPerSecond);
  const cooldown=tickCombatCooldown(actor.cooldown,dt);
  actor.stamina=stamina;
  actor.cooldown=cooldown;
}

/** One semantic view of phases for future group-vs-boss AI policies.
 * Keep the original animation/replay phase strings themselves unchanged. */
export type CombatActorActivity =
  "move" | "attack" | "defend" | "heal" |
  "recover" | "grab" | "disabled" | "dead";

export function combatActorActivity(phase: string): CombatActorActivity {
  switch(phase){
    case "move":
    case "chase": return "move";
    case "windup":
    case "strike":
    case "attack":
    case "cast": return "attack";
    case "roll":
    case "parry": return "defend";
    case "heal": return "heal";
    case "recover":
    case "stagger":
    case "grabMiss": return "recover";
    case "grab":
    case "throw":
    case "grabbed":
    case "thrown": return "grab";
    case "hurt":return "disabled";
    case "dead":return "dead";
    default: throw new RangeError("Unsupported combat actor phase: "+phase);
  }
}
