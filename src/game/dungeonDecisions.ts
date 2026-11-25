import type { AdventurerState } from "./adventurers.ts";
import type {SpatialDungeonHeroProgress,SpatialDungeonReplay,SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {chooseKnownRouteStep} from "./spatialDungeonExploration.ts";
import {heroProgression} from "./heroProgression.ts";
import {equipmentEffects,gearForItem,gearFromName} from "./gearCatalog.ts";
import {hasDungeonLineOfSight} from "./heroPerception.ts";
import {canSoloChallengeVisiblePack} from "./dungeonThreatDecisions.ts";
import {WHOLESALE_GOODS,MATERIAL_ITEMS} from "./economy.ts";
import {dungeonNeighbors,type DungeonLayout,type DungeonFeature} from "./dungeonLayout.ts";

/**
 * A short floor step follows a strategic goal. This logic reads real hero
 * condition and actual visited locations, never fabricates combat or gold.
 * A departure to the shop is only chosen at a floor transition decision,
 * not while a fight is active.
 */
export type HeroDungeonGoal = "farm"|"progress"|"test-gear"|
  "caution"|"resupply"|"loot-chest"|"hunt-ghouls";
export type HeroFloorAction = "stay" | "ascend" | "descend" | "shop";

/** Only chest-accepted materials justify a salvage-selling return. Other finds stay owned. */
export const carriedDungeonFindCount=(hero:AdventurerState):number=>
  MATERIAL_ITEMS.reduce((total,item)=>total+(hero.inventory.finds?.[item.id]??0),0);
export const SALVAGE_RETURN_THRESHOLD=4;

/** Keep the early-game salvage supply chain. A genuinely prepared deep
 * explorer can carry a larger haul instead of resetting a long expedition
 * after every handful of drops. No capacity limit or new inventory state. */
export function salvageReturnThreshold(hero:AdventurerState):number{
  const gear=equipmentEffects(hero.role,hero.equipment);
  if(typeof hero.floor!=="number"||hero.floor<3||!gear.weapon||!gear.vest||
    hero.health/heroProgression(hero).maxHealth<.72||
    hero.inventory.bread+hero.inventory.healing===0)return SALVAGE_RETURN_THRESHOLD;
  if(hero.traits.positive==="careful"||hero.traits.negative==="greedy")return 6;
  return hero.traits.negative==="reckless"?10:8;
}

/** Floor-10 willingness, not a combat modifier or guaranteed victory.
 * Same readiness policy for seeking companions and crossing the real stair.
 * Experience and actual owned class gear matter; personality changes risk.
 * The shop influences this through equipment and supplies, not permission. */
export function isBossExpeditionCandidate(hero:AdventurerState):boolean{
  if(hero.floor!==9||hero.status!=="exploring"||hero.health<=0)return false;
  const gear=equipmentEffects(hero.role,hero.equipment);
  const careful=hero.traits.positive==="careful";
  const reckless=!careful&&hero.traits.negative==="reckless";
  const health=hero.health/heroProgression(hero).maxHealth;
  if(!gear.weapon||(!gear.vest&&!reckless)||
    hero.level<(careful?7:reckless?5:6)||
    health<(careful?.85:reckless?.65:.75))return false;
  return ordinaryExpeditionReadiness(hero)+Number(gearFromName(gear.vest)?.tier===2)
    >=(careful?9:reckless?7:8);
}
export function isBossExpeditionParty(members:readonly AdventurerState[]):boolean{
  return members.length>=2&&members.length<=3&&members.every(isBossExpeditionCandidate);
}

/** An autonomous risk estimate, not a staircase lock or a stat bonus.
 * Experience, actual armor, forged weapons and carried supplies each make
 * a deeper expedition more credible; reckless heroes accept extra risk.
 * Floor 1 remains approachable so newcomers can earn their first gear. */
export function ordinaryExpeditionReadiness(hero:AdventurerState):number {
  const gear=equipmentEffects(hero.role,hero.equipment);
  return hero.level+Number(!!gear.vest)+
    Number(gearFromName(gear.weapon)?.tier===2)+
    Number(hero.inventory.bread+hero.inventory.healing>0)+
    Number(hero.traits.negative==="reckless");
}
/** Assess the DESTINATION with the same readiness floor used by its
 * residents. A hero must not approve a descent and immediately reject the
 * unchanged conditions on arrival. Floor 9 retains its existing approach
 * threshold; Floor-10 readiness is evaluated separately. */
function minimumOrdinaryFloorReadiness(floor:number):number {
  return Math.min(7,Math.max(1,floor-1));
}
/** Gear improves readiness, but cannot substitute for every level of
 * experience against deep packs. This is an autonomous risk preference,
 * shared by departure and residence, not a new progression reward. */
function hasOrdinaryFloorReadiness(hero:AdventurerState,floor:number):boolean {
  const minimumExperience=floor>=5?Math.min(6,floor-2):1;
  return hero.level>=minimumExperience&&
    ordinaryExpeditionReadiness(hero)>=minimumOrdinaryFloorReadiness(floor);
}
function recklessUnarmedSecondFloorRisk(hero:AdventurerState):boolean {
  return hero.traits.negative==="reckless"&&
    hero.health/heroProgression(hero).maxHealth>.85;
}
export function canRiskOrdinaryDescent(hero:AdventurerState):boolean {
  const floor=hero.floor;
  if(typeof floor!=="number"||floor<1||floor>=9)return false;
  const health=hero.health/heroProgression(hero).maxHealth;
  const careful=hero.traits.positive==="careful";
  const reckless=hero.traits.negative==="reckless";
  const armed=!!equipmentEffects(hero.role,hero.equipment).weapon;
  if(!armed)return floor===1&&recklessUnarmedSecondFloorRisk(hero);
  if(health<(careful?.76:reckless?.55:.65))return false;
  return hasOrdinaryFloorReadiness(hero,floor+1);
}

export function needsHealthResupply(hero:AdventurerState):boolean {
  const careful=hero.traits.positive==="careful";
  const reckless=hero.traits.negative==="reckless";
  const melee=hero.role!=="healer";
  return hero.health/heroProgression(hero).maxHealth < (careful?.64:
    reckless?(melee?.40:.33):hero.role==="DPS"?.55:hero.role==="tank"?.52:.48);
}

/** The shop could not resolve the current injury. Stay cautious, or use
 * real stairs to retreat to easier terrain. This is a normal saved plan. */
export function unresolvedRecoveryPlan(hero:AdventurerState):HeroDungeonDecision|null {
  if(typeof hero.floor!=="number"||!needsHealthResupply(hero))return null;
  return {goal:"caution",action:hero.floor>1?"ascend":"stay"};
}

export type DungeonDecisionReason="unserved-recovery"|"low-health"|"new-salvage-haul"|"floor9-gold-resupply"|
  "unprepared-retreat"|"floor9-solo-resupply"|"depth-progress"|"damaged-stay"|
  "test-gear"|"explore"|"combat-retreat"|"boss-ready"|"committed-descent"|"seek-boss-party"|"gear-purchase-resupply"|"depth-risk";
export interface HeroDungeonDecision {
  readonly goal: HeroDungeonGoal;
  readonly action: HeroFloorAction;
}

export function chooseHeroDungeonDecision(
  hero: AdventurerState, progress: SpatialDungeonHeroProgress | undefined,
  replay: SpatialDungeonReplay,
  previousFindCount?:number,onReason?:(reason:DungeonDecisionReason)=>void,
): HeroDungeonDecision {
  if(hero.status!=="exploring"||
      hero.health<=0||typeof hero.floor!=="number"||hero.floor<1||hero.floor>9)
    throw new RangeError("Only living numbered-floor explorers can plan movement");
  const healthRatio=hero.health/heroProgression(hero).maxHealth;
  const careful=hero.traits.positive==="careful";
  const reckless=hero.traits.negative==="reckless";
  const gear=equipmentEffects(hero.role,hero.equipment);
  const armed=!!gear.weapon;
  const armored=!!gear.vest;
  // A wounded melee fighter must cross the attack lane again to do damage.
  // Bring forward ordinary resupply, not healing or invulnerability.
  const lowHealth=needsHealthResupply(hero);
  const damaged=healthRatio < (careful ? 0.76 : 0.55);
  const known=progress?.visited.length??1;
  // Full HP alone is not preparation for increasingly dangerous floors.
  // Reckless novices may risk the first descent; deeper progress requires
  // an actual class weapon and adequate vitality. No artificial stat gain.
  const prepared=canRiskOrdinaryDescent(hero);
  const enoughExperience=known >= (reckless?9:careful?17:13) ||
    replay.outcome==="completed";
  // Both chests and Ghoul victories can create a real haul. LIVE callers
  // supply the pre-settlement count so a dry fight or stale stock cannot
  // independently send the hero straight back to the shop.
  const carriedFinds=carriedDungeonFindCount(hero);
  const newLootSite=replay.steps.some(step=>
    step.action==="treasure"||step.action==="defeat-monster");
  const threshold=salvageReturnThreshold(hero);
  // Carrying old unsold salvage is not a fresh reason to turn around after
  // every additional single drop. Trigger at a newly crossed haul band.
  // A real sale lowers the carried count and makes the next band available.
  const newHaul=newLootSite&&carriedFinds>=threshold&&
    (previousFindCount===undefined||
      Math.floor(carriedFinds/threshold)>Math.floor(previousFindCount/threshold));
  if(lowHealth || newHaul ||
     (hero.floor===9 && newLootSite && hero.gold>=22 && known>=8)) {
    onReason?.(lowHealth?"low-health":newHaul?"new-salvage-haul":"floor9-gold-resupply");
    return {goal:"resupply",action:"shop"};
  }
  const starterWeapon=WHOLESALE_GOODS.find(item=>item.kind==="weapon"&&
    gearForItem(item.id)?.role===hero.role);
  const starterArmor=WHOLESALE_GOODS.find(item=>item.id==="leather-vest");
  // A fresh reward justifies reconsidering a purchase. Exhausting the
  // same already-known floor is NOT another reward: otherwise unavailable
  // class gear causes a shop trip every time the hero reenters that map.
  if(newLootSite&&
    (!armed&&starterWeapon&&hero.gold>=starterWeapon.salePrice||
      armed&&!armored&&hero.floor>=2&&(!prepared||healthRatio<.90)&&
      starterArmor&&hero.gold>=starterArmor.salePrice)){
    onReason?.("gear-purchase-resupply");
    return {goal:"resupply",action:"shop"};
  }
  if(hero.floor>1&&!armed&&enoughExperience&&hero.floor<9&&
    !(hero.floor===2&&recklessUnarmedSecondFloorRisk(hero))){
    onReason?.("unprepared-retreat");return {goal:"caution",action:"ascend"};
  }
  if(hero.floor>=3&&hero.floor<9&&
    !hasOrdinaryFloorReadiness(hero,hero.floor)){
    onReason?.("depth-risk");return {goal:"caution",action:"ascend"};
  }
  if(damaged && hero.floor>1 && !prepared){
    onReason?.("unprepared-retreat");return {goal:"caution",action:"ascend"};
  }
  // A solo explorer cannot start the boss. A genuinely new reward may
  // motivate resupply; old gold and unchanged map knowledge
  // must not send an unprepared hero round the portal indefinitely.
  if(hero.floor===9 && enoughExperience && newLootSite){
    onReason?.("floor9-solo-resupply");return {goal:"resupply",action:"shop"};
  }
  if(hero.floor<9 && prepared && enoughExperience){
    onReason?.("depth-progress");return {goal:"progress",action:"descend"};
  }
  if(damaged){onReason?.("damaged-stay");return {goal:"caution",action:"stay"};}
  if(hero.floor<9&&armed&&!prepared&&enoughExperience){
    onReason?.("depth-risk");return {goal:"test-gear",action:"stay"};
  }
  if(armed && hero.level<=3){onReason?.("test-gear");return {goal:"test-gear",action:"stay"};}
  onReason?.("explore");
  return {goal:!armed?"farm":"progress",action:"stay"};
}

/** Reuse the existing individual needs-based AI on the LIVE world clock.
 * Every ordinary floor shares the same autonomous goals and physical steps.
 */
export function chooseLiveHeroDungeonDecision(
  hero:AdventurerState,progress:SpatialDungeonHeroProgress|undefined,
  replay:SpatialDungeonReplay,layout?:DungeonLayout,world?:SpatialDungeonWorld,
  bossPartyReady=false,previousFindCount?:number,onReason?:(reason:DungeonDecisionReason)=>void,
  priorDecision?:HeroDungeonDecision,bossAvailable=true,previousHealth?:number,
):HeroDungeonDecision {
  if(typeof hero.floor!=="number"||hero.floor<1||hero.floor>9||hero.health<=0||
    hero.status!=="exploring")
    throw new RangeError("Only a living ordinary-floor explorer can make a LIVE choice.");
  if(replay.outcome==="retreat"){
    onReason?.("combat-retreat");return {goal:"resupply",action:"shop"};
  }
  if(bossAvailable&&bossPartyReady&&isBossExpeditionCandidate(hero)){
    onReason?.("boss-ready");return {goal:"progress",action:"descend"};
  }
  let reason:DungeonDecisionReason|undefined;
  const base=chooseHeroDungeonDecision(hero,progress,replay,previousFindCount,
    value=>{reason=value;});
  // An unchanged injury after a failed recovery is not a new shopping
  // need. Real new wounds, a new resource reward or an actual combat
  // retreat still allow another supply visit. Never make a hero immune
  // or force it to descend while hurt.
  if(reason==="low-health"&&priorDecision?.goal==="caution"&&
    previousHealth!==undefined&&hero.health>=previousHealth&&
    !replay.steps.some(s=>s.action==="treasure"||s.action==="defeat-monster")){
    const cautious=unresolvedRecoveryPlan(hero);
    if(cautious){
      onReason?.("unserved-recovery");
      return cautious;
    }
  }
  // Do not send a healthy prepared solo explorer home solely because it
  // has gold or has walked 13 tiles. Seek companions and the actual lower
  // stair; a completed search, real haul or retreat may still end the outing.
  if(bossAvailable&&isBossExpeditionCandidate(hero)&&replay.outcome!=="completed"&&
    (base.action==="stay"||reason==="floor9-gold-resupply"||
      reason==="floor9-solo-resupply")){
    onReason?.("seek-boss-party");
    return {goal:"progress",action:"stay"};
  }
  // A healthy ordinary-floor explorer who already committed to a stair
  // does not abandon it just because the next single movement tick lacks
  // an encounter or because a fresh resource goal is available. Real
  // resupply, caution, retreat and Floor-9 readiness rules still win.
  if(hero.floor<9&&priorDecision?.action==="descend"&&base.action==="stay"&&
      base.goal!=="caution"&&base.goal!=="farm"&&
      canRiskOrdinaryDescent(hero)&&hero.health/heroProgression(hero).maxHealth>=.70){
    onReason?.("committed-descent");
    return {goal:"progress",action:"descend"};
  }
  if(reason)onReason?.(reason);
  return preferKnownDungeonResourceGoal(base,hero,progress,layout,world);
}

/** The full-floor spectator is omniscient; the AI is not. Remember static
 * sites, but a moving monster must be currently visible and unengaged. */
export function selectKnownResourceSite(
  layout:DungeonLayout,progress:SpatialDungeonHeroProgress,world:SpatialDungeonWorld,
  kind:"treasure"|"monster",
  group?:readonly AdventurerState[],
):DungeonFeature|null {
  const known=new Set(progress.visited);
  const adjacent=dungeonNeighbors(layout,progress);
  const sites=layout.features.flatMap(site=>{
    if(site.kind!==kind||world.resolvedFeatureIds.includes(site.id))return [];
    if(kind!=="monster"||world.monsters===undefined)return [site];
    const occupant=world.monsters.find(monster=>monster.id===site.id);
    return occupant&&occupant.mode!=="ENGAGED"&&
      hasDungeonLineOfSight(layout,progress,occupant)&&
      (group?.length!==1||canSoloChallengeVisiblePack(group[0],layout,occupant))
      ?[{...site,x:occupant.x,z:occupant.z}]:[];
  }).filter(site=>
    (known.has(site.z*layout.width+site.x)||
      adjacent.some(p=>p.x===site.x&&p.z===site.z))&&
    (adjacent.some(p=>p.x===site.x&&p.z===site.z)||
      !!chooseKnownRouteStep(layout,progress,site)));
  return sites.sort((a,b)=>
    (Math.abs(a.x-progress.x)+Math.abs(a.z-progress.z))-
    (Math.abs(b.x-progress.x)+Math.abs(b.z-progress.z))||
    a.id.localeCompare(b.id))[0]??null;
}

/** Resource goals are committed by the normal LIVE event owner, not by
 * opening a map. Greedy heroes prioritize chests; prepared fighters hunt. */
export function preferKnownDungeonResourceGoal(
  base:HeroDungeonDecision,hero:AdventurerState,
  progress:SpatialDungeonHeroProgress|undefined,layout:DungeonLayout|undefined,
  world:SpatialDungeonWorld|undefined,
):HeroDungeonDecision {
  if(base.action!=="stay"||base.goal==="caution"||!progress||!layout||!world||
    hero.health/heroProgression(hero).maxHealth<.62)return base;
  const chest=selectKnownResourceSite(layout,progress,world,"treasure");
  // Bravery does not turn a missing weapon into combat preparation.
  // An unequipped hero can still defend itself or flee a genuine pursuer.
  const monster=equipmentEffects(hero.role,hero.equipment).weapon
    ?selectKnownResourceSite(layout,progress,world,"monster"):null;
  if(chest&&(hero.traits.negative==="greedy"||!monster))
    return {goal:"loot-chest",action:"stay"};
  if(monster)return {goal:"hunt-ghouls",action:"stay"};
  if(chest)return {goal:"loot-chest",action:"stay"};
  return base;
}
