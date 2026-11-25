import type { AdventurerState } from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import type { GameState } from "./gameState.ts";
export { heroPortraitIndex as portraitIndex } from "./heroIdentity.ts";

export type RosterFilter = "active" | "fallen";
const PRIORITY: Record<AdventurerState["status"], number> = {
  "at-shop": 0, departing:1, expedition: 2, traveling: 3, returning: 4,
  exploring: 5, "off-duty":6, dead: 7,
};
export function rosterEntries(state: GameState, filter: RosterFilter): readonly AdventurerState[] {
  if (filter === "fallen") {
    const lastEventByHero = new Map<string, number>();
    state.events.forEach((event, index) => {
      if (event.adventurerId) lastEventByHero.set(event.adventurerId, index);
    });
    return state.adventurers.filter((hero) => hero.status === "dead")
      .sort((a, b) => (lastEventByHero.get(b.id) ?? -1) - (lastEventByHero.get(a.id) ?? -1))
      .slice(0, 40);
  }
  return state.adventurers.filter((hero) => hero.status !== "dead")
    .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
/** A safe read-only view over the actual saved party, never proximity. */
export function rosterPartyDetails(state:GameState,heroId:string):{
  readonly formedDay:number;
  readonly floor:number;
  readonly members:readonly AdventurerState[];
}|null {
  const party=state.dungeonParties?.find(p=>p.memberIds.includes(heroId));
  if(!party||party.memberIds.length<2||party.memberIds.length>3)return null;
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const members=party.memberIds.map(id=>byId.get(id));
  if(members.some(member=>!member||member.health<=0||
    member.floor!==party.floor||
    member.status!=="exploring"))
    return null;
  return {formedDay:party.formedDay,floor:party.floor,
    members:members as AdventurerState[]};
}

/** Same ordinal is displayed on every member of a given current group. */
export function temporaryPartyNumber(state:GameState,heroId:string):number|null {
  const valid=rosterPartyDetails(state,heroId);
  if(!valid)return null;
  const index=state.dungeonParties?.findIndex(p=>p.memberIds.includes(heroId))??-1;
  return index>=0?index+1:null;
}

export function partySizeLabel(state:GameState,heroId:string):string {
  const group=rosterPartyDetails(state,heroId);
  const index=temporaryPartyNumber(state,heroId);
  return group&&index!==null
    ?" · Temporary Party #"+index+" ("+group.members.length+")":"";
}

/** Compact physical-board sockets come from actually equipped goods.
 * Empty sockets are intentionally visible, never guessed from level. */
export function rosterBoardEquipment(hero:AdventurerState):{
  readonly weapon:boolean;readonly armor:boolean;readonly hp:string;
} {
  return {
    weapon:hero.equipment.weapon!==null,
    armor:hero.equipment.armor!==null,
    hp:hero.health+"/"+heroProgression(hero).maxHealth,
  };
}

export function locationLabel(hero: AdventurerState): string {
  if (hero.status === "dead") return "Fallen";
  if (hero.status === "at-shop") return "Galvik's Cursed Shop";
  if (hero.status === "departing") return "Leaving Galvik's shop";
  if (hero.status === "off-duty") return "Recovering outside the shop";
  if (hero.status === "expedition") return "F" + hero.floor + " · Expedition";
  if (hero.status === "traveling") return "Crossing the Cursed Threshold";
  if (hero.status === "returning") return "Leaving Galvik's Shop";
  return "F" + hero.floor + " · Exploring";
}
