import {ECONOMY,type ItemId} from "./economy.ts";
import {gearForItem,needsGearUpgrade} from "./gearCatalog.ts";
import {heroProgression} from "./heroProgression.ts";
import {SeededRandom} from "./random.ts";
import type {DungeonLayout,DungeonFeature} from "./dungeonLayout.ts";
import {dungeonRoomPurposeAt} from "./dungeonRoomPurpose.ts";
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
  kind:DungeonDropKind,monsterCount=1,treasureProfile:"ordinary"|"vault"|"workshop"="ordinary",
):DungeonLootRoll {
  const seed=(campaignSeed^Math.imul(floor+13,0x9e3779b1)^
    hash(siteId)^Math.imul(cycle+1,0x85ebca6b))>>>0;
  const rng=new SeededRandom(seed);
  let n=0;
  if(kind==="treasure"){
    n=1+rng.int(3);
    if(treasureProfile==="vault")n=Math.max(2,n);
  }
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
    }else if(treasureProfile==="workshop"&&i===0){
      itemIds.push(rng.int(2)===0?"iron-ore":"coal");
    }else itemIds.push(table[rng.int(table.length)]);
  }
  return {itemIds};
}

/** Only actual treasure contact calls this; physical site cycles still
 * own exactly-once settlement. Workshop contents feed the existing
 * material buyback/forge chain, not a second inventory or currency. */
export function rollDungeonTreasureLoot(campaignSeed:number,layout:DungeonLayout,
  feature:DungeonFeature,cycle:number):DungeonLootRoll{
  if(feature.kind!=="treasure")throw new RangeError("Expected a treasure site");
  const theme=dungeonRoomPurposeAt(layout,feature);
  return rollDungeonSiteLoot(campaignSeed,layout.floor,feature.id,cycle,"treasure",1,
    theme==="vault"||theme==="workshop"?theme:"ordinary");
}

/** A unique item is assigned to ONE living member, not duplicated.
 * Across multiple drops the recipient rotates in stable hero-ID order.
 * A real usable upgrade or needed healing supply goes to a living member
 * who can use it. Unneeded goods retain deterministic rotating ownership.
 * No item is duplicated, exchanged for free gold, or conjured by the AI. */
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
    const offset=(start+index)%alive.length;
    const rotation=Array.from({length:alive.length},(_,i)=>
      assigned.get(alive[(offset+i)%alive.length].id)!);
    const gear=gearForItem(item);
    const upgrade=gear?rotation.find(h=>needsGearUpgrade(h.role,h.equipment,item)):undefined;
    if(upgrade&&gear){
      assigned.set(upgrade.id,{...upgrade,equipment:{
        ...upgrade.equipment,[gear.slot]:gear.name}});
      return;
    }
    if(item==="healing-herb"||item==="bread"){
      const slot=item==="healing-herb"?"healing":"bread";
      // Match the real shop supply target, not an unbounded free stockpile.
      const target=item==="healing-herb"?ECONOMY.healingTarget:ECONOMY.breadTarget;
      const candidate=rotation.filter(h=>h.inventory[slot]<target)
        .sort((a,b)=>a.health/heroProgression(a).maxHealth-b.health/heroProgression(b).maxHealth)[0];
      if(candidate){
        assigned.set(candidate.id,{...candidate,inventory:{
          ...candidate.inventory,[slot]:candidate.inventory[slot]+1}});
        return;
      }
    }
    const current=rotation[0],finds=current.inventory.finds??{};
    assigned.set(current.id,{...current,inventory:{...current.inventory,
      finds:{...finds,[item]:(finds[item]??0)+1}}});
  });
  return party.map(hero=>assigned.get(hero.id)??hero);
}
