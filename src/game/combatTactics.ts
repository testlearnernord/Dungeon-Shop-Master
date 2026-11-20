import type { Point2 } from "./combatGeometry.ts";
import type { MeleeAbilityId } from "./combatMelee.ts";

/**
 * Shared deterministic combat intent, independent from scene objects.
 * The actors and boss both consult this module before their existing
 * group-capable / signature-ability effects are committed.
 */
export interface TacticActor extends Point2 {
  readonly id:string;
  readonly team:"heroes"|"monsters";
  readonly hp:number;
  readonly role?:"tank"|"DPS"|"healer"|"monster";
}

export function selectCombatTarget<T extends TacticActor>(
  actor:TacticActor, candidates:readonly T[],
  tankPreference=0.65,
):T|null {
  if(!Number.isFinite(tankPreference)||tankPreference<0||tankPreference>10)
    throw new RangeError("Invalid tank target preference");
  let selected:T|null=null,score=Infinity;
  // Canonical tie-breaking is independent of the incoming actor array order.
  for(const other of candidates){
    if(other.team===actor.team || other.hp<=0)continue;
    const effective=Math.hypot(other.x-actor.x,other.z-actor.z)-
      (actor.team==="monsters"&&other.role==="tank"?tankPreference:0);
    if(effective<score-1e-8 ||
      (Math.abs(effective-score)<=1e-8 &&
        (!selected||other.id.localeCompare(selected.id)<0))){
      selected=other;score=effective;
    }
  }
  return selected;
}

export interface CombatPostureInput {
  readonly distance:number;
  readonly ready:boolean;
  readonly clearShot:boolean;
  readonly attackRange:number;
  readonly approachBeyond:number;
  readonly withdrawWithin?:number;
}
export interface CombatPosture {
  /** An actor may approach and begin an attack in the same tick if the
   * boss's ability profile permits it; a group walker chooses attack first. */
  readonly attack:boolean;
  readonly approach:boolean;
  readonly withdraw:boolean;
}
export function chooseCombatPosture(input:CombatPostureInput):CombatPosture {
  for(const n of [input.distance,input.attackRange,input.approachBeyond,
    input.withdrawWithin??0]){
    if(!Number.isFinite(n)||n<0)
      throw new RangeError("Combat posture distances must be nonnegative");
  }
  return {
    attack:input.ready && input.clearShot &&
      input.distance<=input.attackRange,
    approach:input.distance>input.approachBeyond,
    withdraw:input.withdrawWithin!==undefined &&
      input.distance<input.withdrawWithin,
  };
}

export type CombatDefense="parry"|"roll"|"none";
export function chooseCombatDefense(input:{
  readonly threatened:boolean;
  readonly stamina:number;
  readonly preferParry:boolean;
  readonly canParry:boolean;
  readonly canRoll?:boolean;
}):CombatDefense {
  if(!Number.isFinite(input.stamina)||input.stamina<0)
    throw new RangeError("Invalid combat stamina for defense");
  if(!input.threatened)return "none";
  if(input.preferParry&&input.canParry&&input.stamina>=20)
    return "parry";
  if(input.canRoll!==false&&input.stamina>=28)
    return "roll";
  return "none";
}

/** Authoritative reaction probability for a telegraphed Troll ability.
 * The Level-6 legacy duel keeps its original seeded roll, while
 * the multi-hero motor uses an actor-ID-stable deterministic sample.
 * Neither the camera nor UI supplies the chance or the outcome. */
export function trollDefenseReadiness(
  agility:number,role:"tank"|"DPS"|"healer"|"monster",grab:boolean,
):number {
  if(!Number.isFinite(agility)||agility<0||agility>1000)
    throw new RangeError("Invalid defense agility");
  return Math.max(.38,Math.min(.78,
    .57+(agility-10)*.015+(role==="tank"?.08:0)-(grab?.10:0)));
}

/** A signature boss skill is still a real ability rather than a free
 * scripted outcome. Group enemies choose the exact same profile contract
 * with their regular/heavy ability list.
 */
export function chooseCombatAbility(
  allowed:readonly MeleeAbilityId[], attackNumber:number,
  gap:number, specialSample:number,
):MeleeAbilityId {
  if(!allowed.length || !Number.isSafeInteger(attackNumber)||attackNumber<1 ||
    !Number.isFinite(gap)||gap<0 ||
    !Number.isFinite(specialSample)||specialSample<0||specialSample>=1)
    throw new RangeError("Invalid combat ability decision");
  if(allowed.includes("troll-grab") && gap<5.3 && attackNumber>1 &&
    (attackNumber%4===0||specialSample<0.45))
    return "troll-grab";
  if(allowed.includes("troll-slam") && attackNumber%3===0)
    return "troll-slam";
  if(allowed.includes("troll-smash"))return "troll-smash";
  // Standard monsters have their equipped ordinary/heavy ability as their
  // only permitted selection. No new surprise attack from a UI refresh.
  return allowed[0];
}
