import {dungeonGenerationSeed} from "./dungeonRegeneration.ts";

/** A pack is one independently saved monster per physical fighter, but it
 * still occupies ONE authored renewable dungeon site. The primary actor
 * always retains the original site's feature ID for legacy replay support. */
export const MAX_GHOUL_PACK=3;

export function ghoulPackActorId(siteId:string,index:number):string {
  if(!siteId||!Number.isSafeInteger(index)||index<0||index>=MAX_GHOUL_PACK)
    throw new RangeError("Invalid Ghoul pack actor identity");
  return index===0?siteId:siteId+":pack:"+index;
}

export function isGhoulPackActorId(
  siteId:string,actorId:string,index:number,
):boolean {
  return index>=0&&index<MAX_GHOUL_PACK&&
    actorId===ghoulPackActorId(siteId,index);
}

/** The pack belongs to its site generation, not the approaching party.
 * Only actual available arena positions can reduce the authored count.
 * Floor 1 is a single Ghoul; Floors 2–7 allow 1–2, Floors 8–9 allow 2–3.
 */
export function ghoulPackCount(
  campaignSeed:number,floor:number,x:number,z:number,
  cycle:number,partySize:number,freeMonsterTiles:number,
):number {
  if(!Number.isSafeInteger(campaignSeed)||campaignSeed<0||
     ![floor,x,z,cycle,partySize,freeMonsterTiles].every(Number.isSafeInteger)||
     floor<1||floor>100||x<0||z<0||cycle<0||
     partySize<1||partySize>3||freeMonsterTiles<0)
    throw new RangeError("Invalid authored Ghoul site or party");
  if(floor===1)return 1;
  const seed=dungeonGenerationSeed(
    (campaignSeed^Math.imul(x+37*z,2654435761)^0x6a93b4d1)>>>0,
    floor+cycle*17);
  const authored=floor<8?1+((seed>>>8)%2):2+((seed>>>8)%2);
  return Math.min(MAX_GHOUL_PACK,authored,1+freeMonsterTiles);
}
