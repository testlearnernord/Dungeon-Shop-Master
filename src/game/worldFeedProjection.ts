import type {GameState,WorldEvent} from "./gameState.ts";
import {ITEMS,type ItemId} from "./economy.ts";

/** The ONE global world feed reads committed events and actual state deltas.
 * This is not an alternate world clock, loot generator or party simulator. */
export type WorldFeedCategory=
  "death"|"boss"|"combat"|"party"|"treasure"|"trap"|"depth"|"travel";
export const WORLD_FEED_CATEGORIES:readonly WorldFeedCategory[]=[
  "death","boss","combat","party","treasure","trap","depth","travel",
];
export type WorldFeedTarget=
  |{kind:"roster";heroId:string}
  |{kind:"death-footage";heroId:string;signalId:string}
  |{kind:"hero";heroId:string}
  |{kind:"floor-site";floor:number;x:number;z:number;heroId:string}
  |{kind:"combat";fightId:string}
  |{kind:"boss";heroId:string};

export interface WorldFeedEntry{
  readonly id:string;
  readonly category:WorldFeedCategory;
  readonly priority:1|2|3;
  readonly title:string;
  readonly detail:string;
  readonly target:WorldFeedTarget;
}

const heroName=(state:GameState,id:string)=>
  state.adventurers.find(hero=>hero.id===id)?.name??"An adventurer";

const findHero=(state:GameState,id:string)=>
  state.adventurers.find(hero=>hero.id===id);

function eventEntry(event:WorldEvent,state:GameState):WorldFeedEntry|null{
  if(event.type==="hero-death-signal"&&event.adventurerId){
    return {id:event.id,category:"death",priority:3,
      title:"LIFE-SIGNATURE EXTINGUISHED",
      detail:event.message+" · A magical signal, not a report of where or how.",
      target:{kind:"death-footage",heroId:event.adventurerId,
        signalId:event.id}};
  }
  if(event.type==="temporary-party-join"&&event.adventurerId){
    const party=state.dungeonParties?.find(p=>
      p.memberIds.includes(event.adventurerId!));
    const names=(party?.memberIds??[event.adventurerId]).map(id=>
      heroName(state,id));
    return {id:party?"party:"+event.day+":"+
        [...party.memberIds].sort().join("+"):event.id,
      category:"party",priority:2,title:"TEMPORARY PARTY FORMED",
      detail:names.join(" + ")+
        (party?" · Floor "+party.floor:" · Companions joined"),
      target:observedFloorTarget(state,event.adventurerId)};
  }
  if(event.type==="shop-arrival"&&event.adventurerId){
    return {id:event.id,category:"travel",priority:1,
      title:"AN ADVENTURER RETURNS",
      detail:heroName(state,event.adventurerId)+" returned to Galvik's shop.",
      target:{kind:"roster",heroId:event.adventurerId}};
  }
  return null;
}
/** Tile is the actual persisted hero position after the committed site
 * resolution, not a guessed treasure marker or passive omniscient route. */
function observedFloorTarget(state:GameState,heroId:string):WorldFeedTarget{
  const hero=findHero(state,heroId);
  if(!hero)return {kind:"hero",heroId};
  const world=hero.floor===7?state.level7World:
    state.earlyDungeonWorlds?.find(entry=>entry.floor===hero.floor)?.world;
  const progress=world?.heroes.find(entry=>entry.heroId===heroId);
  return progress?
    {kind:"floor-site",floor:hero.floor,x:progress.x,z:progress.z,heroId}:
    {kind:"hero",heroId};
}
const itemName=(id:ItemId)=>ITEMS.find(item=>item.id===id)?.name??id;
const plural=(quantity:number,label:string)=>
  quantity+" "+label;

/** Exact physical loot is reconstructed from the same committed before and
 * after inventory snapshots. Equipped Sword/Vest are also real chest finds,
 * even though those gear slots bypass inventory.finds. */
function newDungeonLoot(
  before:GameState,after:GameState,memberIds:readonly string[],
):{items:string;gold:number}{
  const amounts=new Map<ItemId,number>();
  let gold=0;
  for(const id of memberIds){
    const prior=findHero(before,id),next=findHero(after,id);
    if(!prior||!next)continue;
    gold+=Math.max(0,next.gold-prior.gold);
    for(const item of ITEMS){
      const gained=Math.max(0,(next.inventory.finds?.[item.id]??0)-
        (prior.inventory.finds?.[item.id]??0));
      if(gained)amounts.set(item.id,(amounts.get(item.id)??0)+gained);
    }
    if(!prior.equipment.weapon&&next.equipment.weapon==="Iron Sword")
      amounts.set("iron-sword",(amounts.get("iron-sword")??0)+1);
    if(!prior.equipment.armor&&next.equipment.armor==="Leather Vest")
      amounts.set("leather-vest",(amounts.get("leather-vest")??0)+1);
  }
  return {items:[...amounts].map(([id,quantity])=>
    plural(quantity,itemName(id))).join(" · "),gold};
}

/** A genuine co-located party is a single event recipient even though each
 * individual hero retains their own HP and physical loot ownership. Only
 * members with this SAME committed category+tick are coalesced. */
function siteParticipants(
  event:WorldEvent,before:GameState,after:GameState,
  newEvents:readonly WorldEvent[],category:"treasure"|"trap"|"depth",
):readonly string[]{
  const id=event.adventurerId!;
  const party=[...(after.dungeonParties??[]),...(before.dungeonParties??[])]
    .find(p=>p.memberIds.includes(id));
  const candidate=party?.memberIds??[id];
  const same=(e:WorldEvent):boolean=>
    e.type==="dungeon-live"&&e.worldTick===event.worldTick&&
    (category==="depth"?
      (e.floorAction==="ascend"||e.floorAction==="descend")&&
      !!e.adventurerId&&findHero(before,e.adventurerId)?.floor!==
        findHero(after,e.adventurerId)?.floor
      :e.dungeonHighlight===category);
  const participating=new Set(newEvents.filter(same).map(e=>e.adventurerId));
  return [...new Set(candidate.filter(heroId=>participating.has(heroId)))]
    .sort();
}

function dungeonSiteEntry(event:WorldEvent,before:GameState,after:GameState,
  newEvents:readonly WorldEvent[]):WorldFeedEntry|null{
  if(event.type!=="dungeon-live"||!event.adventurerId)return null;
  const id=event.adventurerId;
  const oldHero=findHero(before,id),newHero=findHero(after,id);
  if(!oldHero||!newHero)return null;
  const depthChanged=oldHero.floor!==newHero.floor&&
    (event.floorAction==="ascend"||event.floorAction==="descend");
  const category:"treasure"|"trap"|"depth"|null=
    event.dungeonHighlight==="treasure"?"treasure":
    event.dungeonHighlight==="trap"?"trap":depthChanged?"depth":null;
  if(!category)return null;
  const ids=siteParticipants(event,before,after,newEvents,category);
  if(!ids.length)return null;
  const floor=category==="depth"?newHero.floor:oldHero.floor;
  const names=ids.map(heroId=>heroName(after,heroId)).join(" + ");
  const lead=ids[0];
  const key="world-site:"+event.day+":"+(event.worldTick??0)+":"+
    category+":"+floor+":"+ids.join("+");
  if(category==="treasure"){
    const gained=newDungeonLoot(before,after,ids);
    const contents=[gained.items,gained.gold?"+"+gained.gold+" gold":""]
      .filter(Boolean).join(" · ");
    return {id:key,category:"treasure",priority:2,
      title:ids.length>1?"PARTY CHEST LOOTED":"CHEST LOOTED",
      detail:names+" · Floor "+floor+" · "+
        (contents||"No recoverable items"),
      target:observedFloorTarget(after,lead)};
  }
  if(category==="trap"){
    const hurt=ids.map(heroId=>{
      const previous=findHero(before,heroId),current=findHero(after,heroId);
      return previous&&current?{
        name:heroName(after,heroId),
        damage:Math.max(0,previous.health-current.health),
      }:null;
    }).filter((entry):entry is {name:string;damage:number}=>!!entry);
    const losses=hurt.map(entry=>entry.name+" −"+entry.damage+" HP").join(" · ");
    return {id:key,category:"trap",priority:2,
      title:ids.length>1?"PARTY TRIGGERED A TRAP":"TRAP TRIGGERED",
      detail:"Floor "+floor+" · "+losses,
      target:observedFloorTarget(after,lead)};
  }
  const action=newHero.floor>oldHero.floor?"DESCENDED":"ASCENDED";
  return {id:key,category:"depth",priority:2,
    title:ids.length>1?"PARTY "+action:"ADVENTURER "+action,
    detail:names+" · Floor "+oldHero.floor+" → "+newHero.floor,
    target:observedFloorTarget(after,lead)};
}

export function projectWorldFeedChanges(
  before:GameState,after:GameState,
):readonly WorldFeedEntry[]{
  const results:WorldFeedEntry[]=[];
  const oldEvents=new Set(before.events.map(event=>event.id));
  const newEvents=after.events.filter(event=>!oldEvents.has(event.id));
  const unique=new Set<string>();
  for(const event of newEvents){
    const candidate=dungeonSiteEntry(event,before,after,newEvents)??
      eventEntry(event,after);
    if(candidate&&!unique.has(candidate.id)){
      results.push(candidate);
      unique.add(candidate.id);
    }
  }
  const oldFights=new Set(before.liveDungeon.combats.map(f=>f.id));
  for(const fight of after.liveDungeon.combats){
    if(oldFights.has(fight.id))continue;
    const participants=fight.heroIds.map(id=>heroName(after,id));
    const monsters=fight.encounter.options.actors.filter(actor=>
      actor.team==="monsters").length;
    results.push({id:"fight:"+fight.id,category:"combat",priority:2,
      title:"LIVE DUNGEON ENGAGEMENT",
      detail:participants.join(", ")+" face "+monsters+
        (monsters===1?" Ghoul":" Ghouls")+
        " · Floor "+fight.encounter.floor,
      target:{kind:"combat",fightId:fight.id}});
  }
  const newBoss=after.liveDungeon.bossCombat;
  if(newBoss&&newBoss.id!==before.liveDungeon.bossCombat?.id){
    results.push({id:"boss:"+newBoss.id,category:"boss",priority:3,
      title:"THE CAVE TROLL AWAKENS",
      detail:heroName(after,newBoss.heroId)+
        " has engaged the Cave Troll · Floor 6",
      target:{kind:"boss",heroId:newBoss.heroId}});
  }
  return results.sort((a,b)=>b.priority-a.priority||
    a.id.localeCompare(b.id));
}

export function initialWorldFeedCritical(state:GameState):WorldFeedEntry|null{
  const last=state.events.filter(event=>event.type==="hero-death-signal"&&
    event.day===state.day).at(-1);
  return last?eventEntry(last,state):null;
}
