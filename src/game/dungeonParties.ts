import type { AdventurerState } from "./adventurers.ts";
import type { DungeonLayout } from "./dungeonLayout.ts";
import {
  getLevel7Progress, type Level7World,
} from "./level7Exploration.ts";

/**
 * Opportunistic, autonomous parties: no Galvik orders or invisible teleport.
 * Companions must be living, willing, unprocessed, and already standing on
 * exactly the same tile and floor at the beginning of a committed day.
 * Membership is intentionally ephemeral and can change after each day.
 */
export function willingToTravelTogether(hero:AdventurerState):boolean {
  return hero.health>0 &&
    (hero.role==="healer" || hero.traits.negative!=="reckless" ||
      hero.health/hero.stats.maxHealth<0.6);
}

export function chooseCoLocatedDungeonParty(
  leader:AdventurerState, roster:readonly AdventurerState[],
  world:Level7World, layout:DungeonLayout,
  processed:ReadonlySet<string>,
):readonly AdventurerState[] {
  const validStatus=layout.floor===7?"expedition":"exploring";
  if(processed.has(leader.id)||leader.floor!==layout.floor||
    leader.status!==validStatus||!willingToTravelTogether(leader))
    return [leader];
  const start=getLevel7Progress(world,leader.id,layout);
  const companions=roster.filter(hero=>
    hero.id!==leader.id&&!processed.has(hero.id)&&
    hero.floor===layout.floor&&hero.status===validStatus&&
    willingToTravelTogether(hero)&&
    (()=>{const p=getLevel7Progress(world,hero.id,layout);
      return p.x===start.x&&p.z===start.z;})());
  companions.sort((a,b)=>Number(a.role===leader.role)-
    Number(b.role===leader.role)||a.id.localeCompare(b.id));
  return [leader,...companions.slice(0,2)];
}
