import type {ItemId} from "./economy.ts";
import {SeededRandom} from "./random.ts";
import type {AdventurerState} from "./adventurers.ts";

/** Deterministic item ownership from an actual resolved site generation.
 * Never rolls in the map viewer, and a site is paid exactly once by the
 * spatial encounter/treasure settlement. No global RNG consumption. */
export type DungeonDropKind="treasure"|"monster";
export interface DungeonLootRoll {
  readonly itemIds:readonly ItemId[];
}
const hash=(text:string)=>{
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return h>>>0;
};
const table:readonly ItemId[]=[
  "iron-ore","iron-ore","iron-ore","coal","coal","healing-herb",
  "healing-herb","iron-sword","leather-vest","mana-potion",
];

/** A Ghoul can drop salvage or an uncommon herb. A chest can have 1-3
 * specific goods: raw materials, supplies and occasional wearable gear. */
export function rollDungeonSiteLoot(
  campaignSeed:number,floor:number,siteId:string,cycle:number,
  kind:DungeonDropKind,monsterCount=1,
):DungeonLootRoll {
  const seed=(campaignSeed^Math.imul(floor+13,0x9e3779b1)^
    hash(siteId)^Math.imul(cycle+1,0x85ebca6b))>>>0;
  const rng=new SeededRandom(seed);
  let n=0;
  if(kind==="treasure")n=1+rng.int(3);
  else for(let enemy=0;enemy<Math.min(4,Math.max(1,monsterCount));enemy++)
    if(rng.int(100)<48)n++;
  const itemIds:ItemId[]=[];
  for(let i=0;i<n;i++){
    if(kind==="monster"){
      // Only a TRUE resolved Ghoul combat roll can produce Ghoul Leather.
      // The existing per-site/per-generation award is still exactly once.
      const salvage:readonly ItemId[]=[
        "iron-ore","iron-ore","coal","ghoul-leather","ghoul-leather","healing-herb"];
      itemIds.push(salvage[rng.int(salvage.length)]);
    }else itemIds.push(table[rng.int(table.length)]);
  }
  return {itemIds};
}

/** A unique item is assigned to ONE living member, not duplicated.
 * Across multiple drops the recipient rotates in stable hero-ID order.
 * A new sword/vest is personally kept if the recipient needs the slot;
 * spare items remain physical offers for later merchant buyback. */
export function distributeDungeonFinds(
  party:readonly AdventurerState[],items:readonly ItemId[],
  siteId:string,cycle:number,
):readonly AdventurerState[] {
  const alive=party.filter(h=>h.health>0).sort((a,b)=>
    a.id.localeCompare(b.id));
  if(!alive.length||!items.length)return party;
  const assigned=new Map(alive.map(h=>[h.id,h]));
  const start=(hash(siteId)+cycle)%alive.length;
  items.forEach((item,index)=>{
    const member=alive[(start+index)%alive.length];
    const current=assigned.get(member.id)!;
    if(item==="iron-sword"&&!current.equipment.weapon){
      assigned.set(member.id,{...current,equipment:{
        ...current.equipment,weapon:"Iron Sword"}});
    }else if(item==="leather-vest"&&!current.equipment.armor){
      assigned.set(member.id,{...current,equipment:{
        ...current.equipment,armor:"Leather Vest"}});
    }else{
      const finds=current.inventory.finds??{};
      assigned.set(member.id,{...current,inventory:{...current.inventory,
        finds:{...finds,[item]:(finds[item]??0)+1}}});
    }
  });
  return party.map(hero=>assigned.get(hero.id)??hero);
}
