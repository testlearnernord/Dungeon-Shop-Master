import type {GameState,WorldEvent} from "./gameState.ts";
import type {Level7Replay} from "./level7Exploration.ts";
import {buildDungeonPlayback} from "./dungeonReplayPlayback.ts";
import {WORLD_TICKS_PER_DAY,WORLD_TICKS_PER_GAME_MINUTE} from "./worldClock.ts";

/** A committed fact, not a merchant forecast. Video local time is never
 * treated as world time; missing clock timestamps remain explicitly unknown.
 */
export interface ArchiveBookmark {
  readonly id:string;
  readonly label:string;
  readonly replaySeconds:number;
}
export interface ExpeditionArchiveEntry {
  readonly id:string;
  readonly kind:"expedition"|"contact"|"party"|"death"|"arrival";
  readonly day:number;
  readonly worldTick:number|null;
  readonly clockLabel:string;
  readonly heroId:string;
  readonly heroName:string;
  readonly partyMemberIds:readonly string[];
  readonly partySize:number;
  readonly floor:number|null;
  readonly label:string;
  readonly hasReplay:boolean;
  readonly replaySeconds:number|null;
  readonly bookmarks:readonly ArchiveBookmark[];
}
const EVENT_KINDS:Partial<Record<WorldEvent["type"],ExpeditionArchiveEntry["kind"]>>={
  "dungeon-live":"expedition",
  "dungeon-exploration":"expedition",
  "level7-exploration":"expedition",
  "level6-combat":"expedition",
  "level6-departure":"contact",
  "level7-departure":"contact",
  "temporary-party-join":"party",
  "temporary-party-leave":"party",
  "hero-death-signal":"death",
  "shop-arrival":"arrival",
};
const EVENT_LABELS:Partial<Record<WorldEvent["type"],string>>={
  "dungeon-live":"Dungeon signal",
  "dungeon-exploration":"Recorded dungeon expedition",
  "level7-exploration":"Recorded deep expedition",
  "level6-combat":"Recorded cave encounter",
  "level6-departure":"Departed for a cave encounter",
  "level7-departure":"Departed for deeper floors",
  "temporary-party-join":"Temporary Party contact",
  "temporary-party-leave":"Temporary Party separation",
  "hero-death-signal":"Life-signature extinguished",
  "shop-arrival":"Returned to Galvik's shop",
};
const spatialReplay=(e:WorldEvent):Level7Replay|undefined=>
  e.level7Replay??e.dungeonReplay;

/** EXACT saved world tick when present, otherwise explicitly unknown. */
export function archiveWorldTime(day:number,tick:number|null):string{
  if(tick===null)return "Day "+day+" · time unrecorded";
  const minute=Math.floor((tick%WORLD_TICKS_PER_DAY)/WORLD_TICKS_PER_GAME_MINUTE);
  return "Day "+day+" · "+String(Math.floor(minute/60)).padStart(2,"0")+
    ":"+String(minute%60).padStart(2,"0");
}
function bookmarksOf(record:Level7Replay):{
  seconds:number;bookmarks:ArchiveBookmark[];
}{
  const timeline=buildDungeonPlayback(record);
  const marks:ArchiveBookmark[]=[
    {id:"start",label:"Expedition start",replaySeconds:0},
  ];
  for(const [index,segment] of timeline.segments.entries()){
    const action=segment.step.action;
    let label:string|null=null;
    if(segment.kind==="combat")label="Combat";
    else if(action==="treasure")label="Reached chest";
    else if(action==="trap")label="Trap contact";
    else if(action==="death")label="Fallen";
    else if(action==="retreat")label="Retreated";
    else if(action==="complete")label="Reached objective";
    if(label!==null)marks.push({
      id:"segment:"+index,label,replaySeconds:segment.start,
    });
  }
  return {seconds:timeline.duration,bookmarks:marks};
}

/** Read-only chronological archive. The record itself is saved by the
 * existing dungeon/boss motor. Neither indexing nor inspecting calls AI,
 * simulates combat or modifies the world or any recording.
 *
 * Passive archive headers disclose no hidden HP, treasure quantities,
 * fight outcomes or remote enemy identities. Party membership is available
 * for a deliberately opened tape only; index metadata shows its size.
 */
export function selectExpeditionArchive(
  state:GameState,
):readonly ExpeditionArchiveEntry[]{
  const names=new Map(state.adventurers.map(hero=>[hero.id,hero.name]));
  return state.events.flatMap((event):ExpeditionArchiveEntry[]=>{
    const kind=EVENT_KINDS[event.type];
    if(!kind||!event.adventurerId)return [];
    const replay=spatialReplay(event);
    const members=replay?.partyMemberIds??[];
    const navigation=replay?bookmarksOf(replay):null;
    const hasReplay=!!(replay||event.combatReplay);
    const seconds=navigation?.seconds??
      (event.combatReplay?.frames.at(-1)?.t??null);
    const label=hasReplay?"Saved expedition footage":
      EVENT_LABELS[event.type]??"Expedition contact";
    return [{
      id:event.id,kind,day:event.day,worldTick:event.worldTick??null,
      clockLabel:archiveWorldTime(event.day,event.worldTick??null),
      heroId:event.adventurerId,
      heroName:names.get(event.adventurerId)??event.adventurerId,
      partyMemberIds:members,partySize:members.length,
      floor:replay?.floor??(event.combatReplay?6:null),
      label,hasReplay,replaySeconds:seconds,
      bookmarks:navigation?.bookmarks??(hasReplay?
        [{id:"start",label:"Combat recording",replaySeconds:0}]:[]),
    }];
  });
}

/** Existing saved chronology, not fabricated recordings: individual hero
 * links and true recorded party membership can be filtered separately.
 * A historical companion link is shown only after explicit tape selection.
 */
export function archiveForHero(
  entries:readonly ExpeditionArchiveEntry[],heroId:string,
  includeRecordedCompanions=false,
):readonly ExpeditionArchiveEntry[]{
  return entries.filter(entry=>entry.heroId===heroId||
    includeRecordedCompanions&&entry.partyMemberIds.includes(heroId));
}
