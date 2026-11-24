import type {AdventurerState} from "./adventurers.ts";
import type {GameState,WorldEvent} from "./gameState.ts";
import {firstWorldTickOfDay} from "./worldClock.ts";

/** Galvik's one knowledge boundary for BOTH the placeable board and R/Day HUD.
 * A remote hero's real HP, equipment, floor, loot and dead flag are strictly
 * outside this selector. The only remote signals are explicitly committed,
 * coarse, timestamped events. Never project sealed replay internals.
 */
export type LiveBoardStatus="at-shop"|"off-duty"|"signal"|"last-seen"|"lost";
export type LiveBoardSource="shop"|"magical-signal"|"registry"|"none";
export interface LiveBoardReport {
  readonly eventId:string;
  readonly occurredAtTick:number;
  readonly reportedAtTick:number;
  readonly source:LiveBoardSource;
  readonly text:string;
}
export interface LiveBoardHero {
  readonly id:string;
  readonly name:string;
  readonly role:AdventurerState["role"];
  readonly status:LiveBoardStatus;
  readonly location:string;
  readonly report:LiveBoardReport|null;
  /** These are ONLY exposed when the hero is physically in the shop. */
  readonly visible:AdventurerState|null;
  readonly temporaryPartySignal:boolean;
}

const knownType=new Set<WorldEvent["type"]>([
  "shop-arrival","shop-stay","shop-departure","shop-walkout",
  "sale","shop-credit","tip","influx",
  "dungeon-live","temporary-party-join","temporary-party-leave",
  "hero-death-signal",
]);

function summary(event:WorldEvent):{text:string;source:LiveBoardSource;location:string;status:LiveBoardStatus}{
  switch(event.type){
    case "hero-death-signal":
      return {text:"Life-signature extinguished",source:"magical-signal",
        location:"Location unknown",status:"lost"};
    case "dungeon-live":
      return {text:"Dungeon life-signature detected",source:"magical-signal",
        location:event.reportedZone==="deep"?"Deep dungeon · signal":
          event.reportedZone==="upper"?"Upper dungeon · signal":"Dungeon · signal",
        status:"signal"};
    case "temporary-party-join":
      return {text:"Temporary Party contact reported",source:"magical-signal",
        location:"Dungeon · last contact",status:"signal"};
    case "temporary-party-leave":
      return {text:"Temporary Party separation reported",source:"magical-signal",
        location:"Dungeon · last contact",status:"signal"};
    case "shop-arrival":case "shop-stay":
      return {text:"Seen at Galvik's shop",source:"shop",
        location:"Galvik's shop",status:"at-shop"};
    case "shop-departure":
      return {text:"Observed leaving the shop to recover",source:"shop",
        location:"Outside · shop exit confirmed",status:"off-duty"};
    case "shop-walkout":
      return {text:"Seen heading toward the shop exit",source:"shop",
        location:"Galvik's shop · departing",status:"at-shop"};
    case "sale":case "shop-credit":case "tip":
      return {text:"Observed merchant transaction",source:"shop",
        location:"Galvik's shop · last seen",status:"last-seen"};
    default:return {text:"Adventurer registered",source:"registry",
      location:"Unreported",status:"last-seen"};
  }
}

/** Only committed events can create knowledge, never hidden mutable roster. */
export function selectLiveBoardHeroes(state:GameState):readonly LiveBoardHero[]{
  const latest=new Map<string,WorldEvent>();
  const tp=new Map<string,boolean>();
  const deaths=new Set<string>();
  // One scan regardless of campaign age. Looking for every death anew
  // for each hero used to multiply the cost of long event histories.
  for(const event of state.events){
    if(!event.adventurerId)continue;
    if(event.type==="hero-death-signal")deaths.add(event.adventurerId);
    if(!knownType.has(event.type))continue;
    latest.set(event.adventurerId,event);
    if(event.type==="temporary-party-join")tp.set(event.adventurerId,true);
    else if(event.type==="temporary-party-leave")tp.set(event.adventurerId,false);
  }
  return state.adventurers.map(hero=>{
    const event=latest.get(hero.id);
    const observed=event?summary(event):null;
    const death=deaths.has(hero.id);
    // A real death signal cannot be reversed by a later ordinary activity
    // event. No spoiler if the raw hero is dead but the signal never arrived.
    const physicallyHere=(hero.status==="at-shop"||hero.status==="departing")&&!death;
    const status:LiveBoardStatus=death?"lost":physicallyHere?"at-shop":
      observed?.status==="at-shop"?"last-seen":
      observed?.status==="off-duty"&&hero.status!=="off-duty"?"last-seen":
      observed?.status??"last-seen";
    const location=death?"Life-signature lost":
      physicallyHere?(hero.status==="departing"?"Galvik's shop · departing":
        "Galvik's shop"):observed?.location??"No confirmed contact";
    const when=event?.worldTick??(event?firstWorldTickOfDay(event.day):null);
    return {
      id:hero.id,name:hero.name,role:hero.role,status,location,
      visible:physicallyHere?hero:null,
      temporaryPartySignal:!death&&(tp.get(hero.id)??false),
      report:event&&when!==null?{
        eventId:event.id,occurredAtTick:when,reportedAtTick:when,
        source:observed?.source??"none",
        text:death?"Life-signature extinguished":observed?.text??"Last contact",
      }:null,
    };
  });
}
export function liveBoardHeroesForFilter(
  state:GameState,filter:"active"|"fallen",
):readonly LiveBoardHero[]{
  const heroes=selectLiveBoardHeroes(state);
  const selected=heroes.filter(hero=>filter==="fallen"
    ?hero.status==="lost":hero.status!=="lost");
  if(filter==="fallen")return selected.slice(-40).reverse();
  return selected.sort((a,b)=>Number(b.status==="at-shop")-
    Number(a.status==="at-shop")||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
export function committedDeathSignals(
  state:GameState,day=state.day,
):readonly WorldEvent[]{
  return state.events.filter(e=>e.type==="hero-death-signal"&&e.day===day);
}
