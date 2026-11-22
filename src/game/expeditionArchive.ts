import type {GameState,WorldEvent} from "./gameState.ts";
import {buildDungeonPlayback} from "./dungeonReplayPlayback.ts";
import {containsReplay,REPLAY_LOOKBACK_DAYS} from "./replayRetention.ts";
import {WORLD_TICKS_PER_DAY,WORLD_TICKS_PER_GAME_MINUTE} from "./worldClock.ts";

/** A bounded, read-only timeline of actual committed highlights.
 * Heavy recorded frames are NEVER copied into these list entries.
 */
export type ArchiveDay=number|"saved";
/** Every ordinary dungeon floor, including Floor 6, uses the same replay viewer.
 * Only a recorded Floor-10 Temporary Party enters the boss viewer. */
export const archiveRecordingDestination=(entry:Pick<ExpeditionHighlight,"partyBoss">):
  "dungeon"|"party-boss"=>entry.partyBoss?"party-boss":"dungeon";
export interface ExpeditionHighlight {
  readonly id:string;
  readonly kind:"combat"|"treasure"|"trap"|"party"|"death"|"departure"|"return"|"activity";
  readonly day:number;
  readonly worldTick:number|null;
  readonly clockLabel:string;
  readonly heroId:string;
  readonly heroName:string;
  readonly label:string;
  readonly hasReplay:boolean;
  readonly saved:boolean;
  readonly floor:number|null;
  readonly partySize:number;
  /** Existing v26 Floor-10 group tape, never the old solo BossReplay. */
  readonly partyBoss:boolean;
}
export interface ArchiveBookmark {
  readonly id:string;
  readonly label:string;
  readonly replaySeconds:number;
}

export function archiveWorldTime(day:number,tick:number|null):string{
  if(tick===null)return "Day "+day+" · time unrecorded";
  const minute=Math.floor((tick%WORLD_TICKS_PER_DAY)/WORLD_TICKS_PER_GAME_MINUTE);
  return "Day "+day+" · "+String(Math.floor(minute/60)).padStart(2,"0")+
    ":"+String(minute%60).padStart(2,"0");
}
export function archiveAvailableDays(day:number):readonly number[]{
  return Array.from({length:Math.min(day,REPLAY_LOOKBACK_DAYS+1)},
    (_,i)=>day-i);
}
function classify(event:WorldEvent):{
  kind:ExpeditionHighlight["kind"];label:string;
}|null {
  if(containsReplay(event))return {kind:"combat",label:"Recorded expedition"};
  if(event.type==="dungeon-live"){
    if(event.dungeonHighlight==="treasure")
      return {kind:"treasure",label:"Treasure discovered"};
    if(event.dungeonHighlight==="trap")
      return {kind:"trap",label:"Trap encountered"};
    if(event.floorAction==="ascend"||event.floorAction==="descend")
      return {kind:"activity",label:"Changed dungeon depth"};
    return null;
  }
  if(event.type==="temporary-party-join")
    return {kind:"party",label:"Temporary Party formed"};
  if(event.type==="temporary-party-leave")
    return {kind:"party",label:"Temporary Party separated"};
  if(event.type==="hero-death-signal")
    return {kind:"death",label:"Life-signature extinguished"};
  if(event.type==="level6-departure"||event.type==="level7-departure")
    return {kind:"departure",label:"Departed into the dungeon"};
  if(event.type==="shop-arrival")
    return {kind:"return",label:"Returned to Galvik's shop"};
  return null;
}

/** Timeline is deliberately limited to today + two earlier played days;
 * the Saved view shows only hand-picked tapes and never grows itself.
 */
export function selectExpeditionArchive(
  state:GameState,day:ArchiveDay=state.day,
):readonly ExpeditionHighlight[]{
  const visibleDays=new Set(archiveAvailableDays(state.day));
  const selected=day==="saved"?null:
    visibleDays.has(day)?day:state.day;
  const pinned=new Set(state.savedReplayIds);
  const names=new Map(state.adventurers.map(hero=>[hero.id,hero.name]));
  return state.events.flatMap((event):ExpeditionHighlight[]=>{
    if(!event.adventurerId)return [];
    const hasReplay=containsReplay(event),saved=pinned.has(event.id);
    if(day==="saved"?!saved||!hasReplay:event.day!==selected)return [];
    const kind=classify(event);
    if(!kind)return [];
    const spatial=event.dungeonReplay??event.level7Replay;
    return [{
      id:event.id,kind:kind.kind,day:event.day,
      worldTick:event.worldTick??null,
      clockLabel:archiveWorldTime(event.day,event.worldTick??null),
      heroId:event.adventurerId,
      heroName:names.get(event.adventurerId)??event.adventurerId,
      label:kind.label,hasReplay,saved,
      floor:event.partyBossReplay?10:spatial?.floor??null,
      partySize:event.partyBossReplay?
        event.partyBossReplay.actors.filter(actor=>actor.team==="heroes").length:
        spatial?.partyMemberIds?.length??0,
      partyBoss:!!event.partyBossReplay,
    }];
  });
}

/** Only called when the player opens a particular recording's bookmarks.
 * The original timeline and captured frames are reused, never re-simulated.
 */
export function archiveBookmarks(
  state:GameState,eventId:string,
):readonly ArchiveBookmark[]{
  const event=state.events.find(e=>e.id===eventId);
  if(!event)return [];
  const spatial=event.dungeonReplay??event.level7Replay;
  if(!spatial){
    return event.partyBossReplay?
      [{id:"start",label:"Watch saved combat",replaySeconds:0}]:[];
  }
  const timeline=buildDungeonPlayback(spatial);
  const marks:ArchiveBookmark[]=[{
    id:"start",label:"From beginning",replaySeconds:0,
  }];
  for(const [i,segment] of timeline.segments.entries()){
    const action=segment.step.action;
    const label=segment.kind==="combat"?"Combat":
      action==="treasure"?"Treasure":
      action==="trap"?"Trap":
      action==="death"?"Death":
      action==="retreat"?"Retreat":null;
    if(label)marks.push({
      id:"segment:"+i,label,replaySeconds:segment.start,
    });
  }
  return marks;
}
