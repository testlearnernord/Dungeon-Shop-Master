import type { AdventurerState } from "./adventurers.ts";
import type {SpatialDungeonHeroProgress,SpatialDungeonReplay,SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {chooseKnownRouteStep} from "./spatialDungeonExploration.ts";
import {heroProgression} from "./heroProgression.ts";
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

export interface HeroDungeonDecision {
  readonly goal: HeroDungeonGoal;
  readonly action: HeroFloorAction;
}

export function chooseHeroDungeonDecision(
  hero: AdventurerState, progress: SpatialDungeonHeroProgress | undefined,
  replay: SpatialDungeonReplay,
): HeroDungeonDecision {
  if(hero.status!=="exploring"||
      hero.health<=0||typeof hero.floor!=="number"||hero.floor<1||hero.floor>9)
    throw new RangeError("Only living numbered-floor explorers can plan movement");
  const healthRatio=hero.health/heroProgression(hero).maxHealth;
  const careful=hero.traits.positive==="careful";
  const reckless=hero.traits.negative==="reckless";
  const armed=hero.equipment.weapon!==null;
  const armored=hero.equipment.armor!==null;
  const hasGear=armed||armored;
  const lowHealth=healthRatio < (careful ? 0.64 : reckless ? 0.33 : 0.48);
  const damaged=healthRatio < (careful ? 0.76 : 0.55);
  const known=progress?.visited.length??1;
  const prepared=hasGear||healthRatio>0.70||reckless;
  const enoughExperience=known >= (reckless?9:careful?17:13) ||
    replay.outcome==="completed";
  // Only physically carried, individually owned goods can motivate a
  // treasure haul return. A chest yields at most three real goods, so a
  // four-item threshold preserves multi-chest expedition pacing and stops
  // one lucky chest from instantly splitting prepared travelling parties.
  // Trigger on a NEW chest, never on stale unsold stock after reentry.
  const carriedFinds=Object.values(hero.inventory.finds??{})
    .reduce((total,count)=>total+(count??0),0);
  const newChest=replay.steps.some(step=>step.action==="treasure");
  if(lowHealth || (newChest&&carriedFinds>=4) ||
     (hero.floor===9 && hero.gold>=22 && known>=8)) {
    return {goal:"resupply",action:"shop"};
  }
  if(damaged && hero.floor>1 && !prepared)
    return {goal:"caution",action:"ascend"};
  // Normal solo Floor-9 logic cannot initiate a group fight. The LIVE
  // override below may descend only with an actual saved, permitted party;
  // otherwise returning to Galvik is a valid recovery choice.
  if(hero.floor===9 && enoughExperience)
    return {goal:"resupply",action:"shop"};
  if(hero.floor<9 && prepared && enoughExperience)
    return {goal:"progress",action:"descend"};
  if(damaged)
    return {goal:"caution",action:"stay"};
  if(armed && hero.level<=3)
    return {goal:"test-gear",action:"stay"};
  return {goal:!armed && hero.gold<18?"farm":"progress",action:"stay"};
}

/** Reuse the existing individual needs-based AI on the LIVE world clock.
 * Every ordinary floor shares the same autonomous goals and physical steps.
 */
export function chooseLiveHeroDungeonDecision(
  hero:AdventurerState,progress:SpatialDungeonHeroProgress|undefined,
  replay:SpatialDungeonReplay,layout?:DungeonLayout,world?:SpatialDungeonWorld,
  bossPartyReady=false,
):HeroDungeonDecision {
  if(typeof hero.floor!=="number"||hero.floor<1||hero.floor>9||hero.health<=0||
    hero.status!=="exploring")
    throw new RangeError("Only a living ordinary-floor explorer can make a LIVE choice.");
  if(replay.outcome==="retreat")
    return {goal:"resupply",action:"shop"};
  if(hero.floor===9&&bossPartyReady&&
     (progress?.visited.length??0)>=13&&
     hero.health/heroProgression(hero).maxHealth>=0.60)
    return {goal:"progress",action:"descend"};
  return preferKnownDungeonResourceGoal(
    chooseHeroDungeonDecision(hero,progress,replay),hero,progress,layout,world);
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
  if(base.action!=="stay"||!progress||!layout||!world||
    hero.health/heroProgression(hero).maxHealth<.62)return base;
  const chest=selectKnownResourceSite(layout,progress,world,"treasure");
  const monster=hero.equipment.weapon!==null||
    hero.traits.positive==="brave"
    ?selectKnownResourceSite(layout,progress,world,"monster"):null;
  if(chest&&(hero.traits.negative==="greedy"||!monster))
    return {goal:"loot-chest",action:"stay"};
  if(monster)return {goal:"hunt-ghouls",action:"stay"};
  if(chest)return {goal:"loot-chest",action:"stay"};
  return base;
}
