import {GRAPPLE_TIMING} from "./combatGrapple.ts";
import {chooseCombatAbility} from "./combatTactics.ts";
import {meleeAbilityProfile} from "./combatMelee.ts";

/**
 * The Cave Troll's abilities belong to the authoritative encounter layer.
 * Both the historical solo duel and the group-capable dungeon motor consume
 * these exact timings and strike profiles. The arena and audio are observers.
 *
 * A legacy BossCombatReplay v1 retains its original actor/phase naming;
 * a GroupCombatReplay v1 retains its actor list. Neither is re-simulated.
 */
export type TrollSignatureAttack="smash"|"slam"|"grab";
export type TrollGroupMelee="troll-smash"|"troll-slam"|"grapple";

const BASE_SMASH_DAMAGE=33;
const BASE_SLAM_DAMAGE=47;

export interface TrollSignatureProfile {
  readonly attack:TrollSignatureAttack;
  readonly groupAbility:TrollGroupMelee;
  readonly windupSeconds:number;
  /** Contact delay relative to the start of the strike or grab phase. */
  readonly contactSeconds:number;
  /** Strike or grab action finishes after this phase duration. */
  readonly actionSeconds:number;
  readonly recoverySeconds:number;
  readonly reach:number;
  readonly damageMultiplier:number;
  /** Absolute raw damage authored for the Level-6 training/legacy duel. */
  readonly soloRawDamage:number;
}

export function trollSignatureProfile(
  attack:TrollSignatureAttack,
):TrollSignatureProfile {
  const groupAbility:TrollGroupMelee=attack==="grab"?"grapple":
    attack==="slam"?"troll-slam":"troll-smash";
  const ability=meleeAbilityProfile(
    attack==="grab"?"troll-grab":groupAbility);
  const grab=attack==="grab";
  const slam=attack==="slam";
  return {
    attack,groupAbility,
    windupSeconds:grab?GRAPPLE_TIMING.windup:slam?1.05:.85,
    contactSeconds:grab?GRAPPLE_TIMING.grabContact:.14,
    actionSeconds:grab?GRAPPLE_TIMING.grab:.38,
    recoverySeconds:grab?GRAPPLE_TIMING.recover:.72,
    reach:ability.reach,
    damageMultiplier:grab?1:slam?BASE_SLAM_DAMAGE/BASE_SMASH_DAMAGE:1,
    soloRawDamage:slam?BASE_SLAM_DAMAGE:BASE_SMASH_DAMAGE,
  };
}

/** The same target-distance and special-ability arbitration is used by
 * either encounter. The *source* of a deterministic sample may differ:
 * the old solo fight retains its exact seeded combatRoll stream, while
 * groups use identity-stable samples to avoid member-order dependence. */
export function chooseTrollSignatureAttack(
  attackNumber:number,gap:number,sample:number,
):TrollSignatureAttack {
  const selected=chooseCombatAbility(
    ["troll-smash","troll-slam","troll-grab"],
    attackNumber,gap,sample);
  return selected==="troll-grab"?"grab":
    selected==="troll-slam"?"slam":"smash";
}

export function fromTrollGroupAbility(
  ability:TrollGroupMelee,
):TrollSignatureAttack {
  return ability==="grapple"?"grab":
    ability==="troll-slam"?"slam":"smash";
}


/** Resolve an attack by its committed ability, never by its owner's identity. */
export function signatureProfileForAbility(
  ability:"ordinary"|"heavy"|TrollGroupMelee,
):TrollSignatureProfile|null {
  return ability==="ordinary"||ability==="heavy"
    ?null:trollSignatureProfile(fromTrollGroupAbility(ability));
}
