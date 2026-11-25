import {chooseTrollSignatureAttack,trollSignatureProfile,signatureProfileForAbility,type TrollGroupMelee} from "./combatSignatureAbilities.ts";
import type {CombatTeam,GroupRole} from "./groupCombat.ts";

/** Read-only behavior data resolved from existing actor capabilities.
 * No new checkpoint fields and no opponent identity switches.
 * A future monster can select an attack set independently of its lifecycle.
 */
export interface CombatBehaviorProfile {
  readonly initialCooldown:number;
  readonly hurtSeconds:number;
  readonly hurtCooldown:number;
  readonly recoilSpeed:number;
  readonly recoilSeconds:number;
  readonly minimumPoise:number;
  readonly healthPoiseRatio:number;
  readonly attackSet:"standard"|"grapple-throw";
}
const HERO:CombatBehaviorProfile=Object.freeze({
  initialCooldown:0,hurtSeconds:.34,hurtCooldown:0,
  recoilSpeed:0,recoilSeconds:0,minimumPoise:0,healthPoiseRatio:0,
  attackSet:"standard",
});
const MONSTER:CombatBehaviorProfile=Object.freeze({
  initialCooldown:0,hurtSeconds:.42,hurtCooldown:0,
  recoilSpeed:1,recoilSeconds:.18,minimumPoise:0,healthPoiseRatio:0,
  attackSet:"standard",
});
const GRAPPLER:CombatBehaviorProfile=Object.freeze({
  initialCooldown:1.1,hurtSeconds:1.6,hurtCooldown:1.4,
  recoilSpeed:0,recoilSeconds:0,minimumPoise:62,healthPoiseRatio:.22,
  attackSet:"grapple-throw",
});
const MONSTER_CAPABILITIES={"grapple-throw":GRAPPLER} as const;
export function combatBehaviorProfile(actor:{
  readonly team:CombatTeam;
  readonly specialAbility?:"grapple-throw";
}):CombatBehaviorProfile{
  return actor.team==="heroes"?HERO:
    actor.specialAbility?MONSTER_CAPABILITIES[actor.specialAbility]:MONSTER;
}
export function chooseActorMeleeAbility(
  profile:CombatBehaviorProfile,ordinary:"ordinary"|"heavy",
  nextAttack:number,gap:number,sample:()=>number,
):"ordinary"|"heavy"|TrollGroupMelee{
  if(profile.attackSet==="standard")return ordinary;
  // Preserve the authored grapple cadence in the attack-set policy.
  const grabTurn=nextAttack>1&&nextAttack%3===2;
  return trollSignatureProfile(chooseTrollSignatureAttack(
    nextAttack,gap,grabTurn?0:sample())).groupAbility;
}
export function offensiveCooldown(
  actor:{readonly style:"melee"|"ranged";readonly role:GroupRole},
  ability:"ordinary"|"heavy"|TrollGroupMelee,
):number{
  if(actor.style==="ranged")return actor.role==="healer"?2:1.3;
  if(ability==="grapple")return 3.5;
  if(signatureProfileForAbility(ability))return 1.5;
  return ability==="heavy"?1.62:actor.role==="DPS"?.92:1.16;
}
/** Timing after a completed action is determined by that action's profile. */
export function postRecoveryCooldown(ability:"ordinary"|"heavy"|TrollGroupMelee):number{
  return signatureProfileForAbility(ability)?1.5:0;
}
