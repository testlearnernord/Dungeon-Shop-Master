import type {GameState,WorldEvent} from "./gameState.ts";

/** This is a read-only projection. Authoritative world events and the single
 * live combat registry are the only sources; never roll AI, award loot or
 * peek into sealed replay frames to invent a notification. */
export type WorldFeedCategory="death"|"boss"|"combat"|"party"|"treasure"|"travel";
export type WorldFeedTarget=
  |{kind:"roster";heroId:string}
  |{kind:"hero";heroId:string}
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

function eventEntry(
  event:WorldEvent,state:GameState,
):WorldFeedEntry|null{
  if(event.type==="hero-death-signal"&&event.adventurerId){
    return {id:event.id,category:"death",priority:3,
      title:"LIFE-SIGNATURE EXTINGUISHED",
      detail:event.message+" · A magical signal, not a report of where or how.",
      target:{kind:"roster",heroId:event.adventurerId}};
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
        (party?" · Dungeon floor "+party.floor:" · Companions joined"),
      target:{kind:"hero",heroId:event.adventurerId}};
  }
  if(event.type==="dungeon-live"&&
     event.dungeonHighlight==="treasure"&&event.adventurerId){
    return {id:event.id,category:"treasure",priority:1,
      title:"TREASURE DISCOVERED",
      detail:heroName(state,event.adventurerId)+
        " discovered something valuable.",
      target:{kind:"hero",heroId:event.adventurerId}};
  }
  if(event.type==="shop-arrival"&&event.adventurerId){
    return {id:event.id,category:"travel",priority:1,
      title:"AN ADVENTURER RETURNS",
      detail:heroName(state,event.adventurerId)+" returned to Galvik's shop.",
      target:{kind:"roster",heroId:event.adventurerId}};
  }
  return null;
}

export function projectWorldFeedChanges(
  before:GameState,after:GameState,
):readonly WorldFeedEntry[]{
  const results:WorldFeedEntry[]=[];
  const oldEvents=new Set(before.events.map(event=>event.id));
  const unique=new Set<string>();
  for(const event of after.events){
    if(oldEvents.has(event.id))continue;
    const candidate=eventEntry(event,after);
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
  // The most urgent information takes priority when multiple real
  // checkpoints are committed by one deterministic world step.
  return results.sort((a,b)=>b.priority-a.priority||
    a.id.localeCompare(b.id));
}

/** Preserve the pre-existing critical death warning on loading a campaign,
 * without replaying old combat starts, routine parties or every shop visit.
 * Dismissed/snoozed toasts are UI-only and never rewrite WorldEvent history. */
export function initialWorldFeedCritical(
  state:GameState,
):WorldFeedEntry|null{
  const last=state.events.filter(event=>event.type==="hero-death-signal"&&
    event.day===state.day).at(-1);
  return last?eventEntry(last,state):null;
}
