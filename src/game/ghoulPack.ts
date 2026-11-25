import {SeededRandom} from "./random.ts";
import {dungeonGenerationSeed} from "./dungeonRegeneration.ts";
import {tileAt,type DungeonLayout,type DungeonPoint} from "./dungeonLayout.ts";

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

/** The same renewable elite rule used by the encounter composer. */
export function isEliteGhoulSite(layout:DungeonLayout,source:DungeonPoint,cycle:number):boolean{
  return layout.floor===7&&cycle>0&&cycle%4===1&&
    tileAt(layout,source.x,source.z)==="room";
}

/** A visible map occupant represents its authored pack, not one fighter.
 * Its composition is fixed to the renewable source. Arena placement can
 * reduce the final count; do not predict future free spawn tiles in AI. */
export function observedGhoulPackSize(layout:DungeonLayout,source:DungeonPoint,cycle:number):number{
  return isEliteGhoulSite(layout,source,cycle)?1:
    ghoulPackCount(layout.seed,layout.floor,source.x,source.z,cycle,1,MAX_GHOUL_PACK-1);
}


/** One seeded individual strength profile for both the living dungeon and
 * disposable Combat Lab. The optional toughness multiplier is retained
 * only for the bounded atomic encounter fixture; LIVE/Lab use exactly 1. */
export function ghoulCombatProfile(floor:number,seed:number,elite=false,toughness=1){
  if(!Number.isSafeInteger(floor)||floor<1||floor>9||
    !Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
    !Number.isFinite(toughness)||toughness<1)
    throw new RangeError("Invalid Ghoul combat profile");
  const rng=new SeededRandom(seed);
  const baseHp=(floor===7?22+rng.int(13):12+floor*3+rng.int(7))+(elite?24:0);
  const hp=Math.round(baseHp*2.4*toughness);
  const damage=(floor===7?8+rng.int(4):2+floor+rng.int(3))+(elite?4:0);
  return {
    team:"monsters" as const,role:"monster" as const,style:"melee" as const,
    hp,maxHp:hp,damage,armor:1+(elite?4:0),
    speed:elite?2.7:3,reach:elite?2:1.6,
    ...(elite?{radius:1.05,agility:8,staggerThreshold:12,meleeAbility:"heavy" as const}:{}),
  };
}
