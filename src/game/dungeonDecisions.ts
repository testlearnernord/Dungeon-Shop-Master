import type { AdventurerState } from "./adventurers.ts";
import type {SpatialDungeonHeroProgress,SpatialDungeonReplay,SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {chooseKnownRouteStep} from "./spatialDungeonExploration.ts";
import {heroProgression} from "./heroProgression.ts";
import {equipmentEffects,gearForItem} from "./gearCatalog.ts";
import {WHOLESALE_GOODS} from "./economy.ts";
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

/** Only spare goods actually owned by the individual count toward a haul. */
export const carriedDungeonFindCount=(hero:AdventurerState):number=>
  Object.values(hero.inventory.finds??{}).reduce((total,count)=>total+(count??0),0);
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

/** A pass is not a teleport. Prepared, living explorers can seek willing
 * companions on Floor 9; the actual physical saved-party gate remains intact. */
export function isBossExpeditionCandidate(hero:AdventurerState):boolean{
  return hero.floor===9&&hero.status==="exploring"&&hero.bossPass&&
    !!equipmentEffects(hero.role,hero.equipment).weapon&&
    hero.health/heroProgression(hero).maxHealth>=
      (hero.traits.positive==="careful"?.70:.60);
}
export function isBossExpeditionParty(members:readonly AdventurerState[]):boolean{
  return members.length>=2&&members.length<=3&&members.every(isBossExpeditionCandidate);
}

export type DungeonDecisionReason="low-health"|"new-salvage-haul"|"floor9-gold-resupply"|
  "unprepared-retreat"|"floor9-solo-resupply"|"depth-progress"|"damaged-stay"|
  "test-gear"|"explore"|"combat-retreat"|"boss-ready"|"committed-descent"|"seek-boss-party"|"gear-purchase-resupply";
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
  const lowHealth=healthRatio < (careful ? 0.64 : reckless ? 0.33 : 0.48);
  const damaged=healthRatio < (careful ? 0.76 : 0.55);
  const known=progress?.visited.length??1;
  // Full HP alone is not preparation for increasingly dangerous floors.
  // Reckless novices may risk the first descent; deeper progress requires
  // an actual class weapon and adequate vitality. No artificial stat gain.
  const prepared=armed&&healthRatio>=(careful?.76:reckless?.55:.65)||
    hero.floor===1&&reckless&&healthRatio>.85;
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
     (hero.floor===9 && hero.gold>=22 && known>=8)) {
    onReason?.(lowHealth?"low-health":newHaul?"new-salvage-haul":"floor9-gold-resupply");
    return {goal:"resupply",action:"shop"};
  }
  const starterWeapon=WHOLESALE_GOODS.find(item=>item.kind==="weapon"&&
    gearForItem(item.id)?.role===hero.role);
  const starterArmor=WHOLESALE_GOODS.find(item=>item.id==="leather-vest");
  // A fresh reward or exhausted search is a real occasion to buy missing
  // gear. Do not reroll a failed shop visit just because old gold persists.
  if((newLootSite||replay.outcome==="completed")&&
    (!armed&&starterWeapon&&hero.gold>=starterWeapon.salePrice||
      armed&&!armored&&hero.floor>=3&&healthRatio<.90&&
      starterArmor&&hero.gold>=starterArmor.salePrice)){
    onReason?.("gear-purchase-resupply");
    return {goal:"resupply",action:"shop"};
  }
  if(hero.floor>1&&!armed&&enoughExperience&&hero.floor<9){
    onReason?.("unprepared-retreat");return {goal:"caution",action:"ascend"};
  }
  if(damaged && hero.floor>1 && !prepared){
    onReason?.("unprepared-retreat");return {goal:"caution",action:"ascend"};
  }
  // Normal solo Floor-9 logic cannot initiate a group fight. The LIVE
  // override below may descend only with an actual saved, permitted party;
  // otherwise returning to Galvik is a valid recovery choice.
  if(hero.floor===9 && enoughExperience){
    onReason?.("floor9-solo-resupply");return {goal:"resupply",action:"shop"};
  }
  if(hero.floor<9 && prepared && enoughExperience){
    onReason?.("depth-progress");return {goal:"progress",action:"descend"};
  }
  if(damaged){onReason?.("damaged-stay");return {goal:"caution",action:"stay"};}
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
  priorDecision?:HeroDungeonDecision,bossAvailable=true,
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
  // Do not send a healthy permitted solo explorer home solely because it
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
  // resupply, caution, retreat and Floor-9 permission rules still win.
  if(hero.floor<9&&priorDecision?.action==="descend"&&base.action==="stay"&&
      base.goal!=="caution"&&base.goal!=="farm"&&
      hero.health/heroProgression(hero).maxHealth>=.70){
    onReason?.("committed-descent");
    return {goal:"progress",action:"descend"};
  }
  if(reason)onReason?.(reason);
  return preferKnownDungeonResourceGoal(base,hero,progress,layout,world);
}

/** The full-floor spectator is omniscient; the AI is not. Only personally
 * visited or directly adjacent unresolved site coordinates are eligible. */
export function selectKnownResourceSite(
  layout:DungeonLayout,progress:SpatialDungeonHeroProgress,world:SpatialDungeonWorld,
  kind:"treasure"|"monster",
):DungeonFeature|null {
  const known=new Set(progress.visited);
  const adjacent=dungeonNeighbors(layout,progress);
  const sites=layout.features.flatMap(site=>{
    if(site.kind!==kind||world.resolvedFeatureIds.includes(site.id))return [];
    if(kind!=="monster"||world.monsters===undefined)return [site];
    const occupant=world.monsters.find(monster=>monster.id===site.id);
    return occupant?[{...site,x:occupant.x,z:occupant.z}]:[];
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
