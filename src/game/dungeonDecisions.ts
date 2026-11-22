import type { AdventurerState } from "./adventurers.ts";
import type {Level7HeroProgress,Level7Replay,Level7World} from "./level7Exploration.ts";
import {chooseKnownRouteStep} from "./level7Exploration.ts";
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
  hero: AdventurerState, progress: Level7HeroProgress | undefined,
  replay: Level7Replay,
): HeroDungeonDecision {
  if(hero.status!=="exploring"||hero.health<=0||hero.floor>4)
    throw new RangeError("Only living early-floor explorers can plan movement");
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
  // Their own purpose can change after a real injury or a real looted chest.
  if(lowHealth || hero.inventory.loot >= 2 ||
     (hero.floor===4 && hero.gold>=22 && known>=8)) {
    return {goal:"resupply",action:"shop"};
  }
  if(damaged && hero.floor>1 && !prepared)
    return {goal:"caution",action:"ascend"};
  if(hero.floor===4 && enoughExperience)
    return {goal:"resupply",action:"shop"};
  if(hero.floor<4 && prepared && enoughExperience)
    return {goal:"progress",action:"descend"};
  if(damaged)
    return {goal:"caution",action:"stay"};
  if(armed && hero.level<=3)
    return {goal:"test-gear",action:"stay"};
  return {goal:!armed && hero.gold<18?"farm":"progress",action:"stay"};
}

/** Reuse the existing individual needs-based AI on the LIVE world clock.
 * Floor 7 is a special unlocked expedition: it cannot invent Floor 8
 * until the next authored progression slice exists.
 */
export function chooseLiveHeroDungeonDecision(
  hero:AdventurerState,progress:Level7HeroProgress|undefined,
  replay:Level7Replay,layout?:DungeonLayout,world?:Level7World,
):HeroDungeonDecision {
  if(hero.floor>=1&&hero.floor<=4) {
    if(replay.outcome==="retreat")
      return {goal:"resupply",action:"shop"};
    return preferKnownDungeonResourceGoal(chooseHeroDungeonDecision(hero,progress,replay),hero,progress,layout,world);
  }
  if(hero.floor!==7||hero.status!=="expedition"||hero.health<=0)
    throw new RangeError("Only a living spatial explorer can make a LIVE choice.");
  if(replay.outcome==="completed"||replay.outcome==="retreat"||
    hero.health/heroProgression(hero).maxHealth<0.48||hero.inventory.loot>=2)
    return {goal:"resupply",action:"shop"};
  return preferKnownDungeonResourceGoal({goal:hero.equipment.weapon?"test-gear":"caution",action:"stay"},hero,progress,layout,world);
}

/** The full-floor spectator is omniscient; the AI is not. Only personally
 * visited or directly adjacent unresolved site coordinates are eligible. */
export function selectKnownResourceSite(
  layout:DungeonLayout,progress:Level7HeroProgress,world:Level7World,
  kind:"treasure"|"monster",
):DungeonFeature|null {
  const known=new Set(progress.visited);
  const adjacent=dungeonNeighbors(layout,progress);
  const sites=layout.features.filter(site=>
    site.kind===kind&&!world.resolvedFeatureIds.includes(site.id)&&
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
  progress:Level7HeroProgress|undefined,layout:DungeonLayout|undefined,
  world:Level7World|undefined,
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
