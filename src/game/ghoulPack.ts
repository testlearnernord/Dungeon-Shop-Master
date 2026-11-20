import {dungeonGenerationSeed} from "./dungeonLayout.ts";

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

/** Decision is stable for the site generation and party, not combat FPS,
 * render count, scene opening, or a mutable campaign RNG stream.
 * A solo explorer can face at most two, a real party at most three.
 * Floor 1 keeps historic solo site encounters intact.
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
  const cap=Math.min(MAX_GHOUL_PACK,
    floor===2?2:partySize===1?2:3,1+freeMonsterTiles);
  return 1+((seed>>>8)%Math.max(1,cap));
}
