import {
  inAttackArc, parryActive, rollInvulnerable, type Point2,
} from "./combatGeometry.ts";

/**
 * Shared contact and defense rules. Ordinary monsters and unique bosses
 * provide a profile; they do not invent their own dodge/parry/hit logic.
 * This is the authority for melee contact, not for animation or movement.
 *
 * Historical replays continue using their captured outcomes and are
 * intentionally not re-resolved when these profiles change.
 */
export type MeleeAbilityId =
  "ordinary" | "heavy" | "troll-smash" | "troll-slam" | "troll-grab";

export interface MeleeAbilityProfile {
  readonly id: MeleeAbilityId;
  readonly reach: number;
  readonly halfAngleRadians: number;
  readonly parryReach: number;
  readonly parryHalfAngleRadians: number;
  readonly parryRequiresWeapon: boolean;
  /** Only group-combat ordinary/heavy actions consume these timing values. */
  readonly windupSeconds: number;
  readonly strikeDelaySeconds: number;
  readonly strikeEndSeconds: number;
  readonly damageMultiplier: number;
}

const ordinary = {
  parryReach: 4,
  parryHalfAngleRadians: 1.25,
  parryRequiresWeapon: false,
  windupSeconds: 0.62,
  strikeDelaySeconds: 0.16,
  strikeEndSeconds: 0.33,
  damageMultiplier: 1,
} as const;

/** Actual boss arc values, formerly duplicated in the boss duel implementation. */
export function meleeAbilityProfile(
  id: MeleeAbilityId, baseReach = 1.6,
): MeleeAbilityProfile {
  switch (id) {
    case "ordinary":
      return {id, ...ordinary, reach:baseReach, halfAngleRadians:0.91};
    case "heavy":
      return {
        ...ordinary, id, reach:baseReach+0.35,
        halfAngleRadians:1.10,
        windupSeconds:0.94, strikeDelaySeconds:0.20,
        strikeEndSeconds:0.40, damageMultiplier:1.35,
      };
    case "troll-smash":
      return {
        ...ordinary, id, reach:5.2+0.58,
        halfAngleRadians:0.90, parryReach:6.8,
      };
    case "troll-slam":
      return {
        ...ordinary, id, reach:6.2+0.58,
        halfAngleRadians:1.30, parryReach:6.8,
      };
    case "troll-grab":
      return {
        ...ordinary, id, reach:5.1, halfAngleRadians:1.18,
        parryReach:6.8, parryRequiresWeapon:true,
      };
  }
}

export type MeleeContact = "miss" | "dodge" | "parry" | "hit";

export interface MeleeContactInput {
  readonly attacker: Point2;
  readonly lockedHeading: number;
  readonly defender: Point2;
  readonly defenderHeading: number;
  readonly defenderPhase: string;
  readonly defenderPhaseAge: number;
  readonly ability: MeleeAbilityProfile;
  /** False when a wall blocks an otherwise reachable attack. */
  readonly lineClear?: boolean;
  /** A boss grab may require an equipped sword to parry, unlike a smash. */
  readonly defenderHasWeapon?: boolean;
}

/** One deterministic ordering: geometry -> line of sight -> roll -> parry -> hit. */
export function resolveMeleeContact(input: MeleeContactInput): MeleeContact {
  const {attacker,lockedHeading,defender,defenderHeading,
    defenderPhase,defenderPhaseAge,ability}=input;
  if (!inAttackArc(attacker,lockedHeading,defender,
    ability.reach,ability.halfAngleRadians) ||
    input.lineClear===false) return "miss";
  if (defenderPhase==="roll" && rollInvulnerable(defenderPhaseAge))
    return "dodge";
  if (defenderPhase==="parry" && parryActive(defenderPhaseAge) &&
    (!ability.parryRequiresWeapon || input.defenderHasWeapon===true) &&
    inAttackArc(defender,defenderHeading,attacker,
      ability.parryReach,ability.parryHalfAngleRadians))
    return "parry";
  return "hit";
}
