import {DUNGEON_STEP_INTERVAL_TICKS} from "./dungeonPacing.ts";
export {DUNGEON_STEP_INTERVAL_TICKS} from "./dungeonPacing.ts";
import {manuallyPaidVisitors} from "./npcVisitors.ts";
import type {GameState,WorldEvent} from "./gameState.ts";
import {dungeonWorldAt,setDungeonWorld} from "./dungeonWorldState.ts";
import {advanceDungeonMonsterWorld} from "./dungeonMonsterWorld.ts";
import {chooseDungeonThreatReaction,chooseRememberedThreatReaction,recentDungeonThreat,type DungeonThreatMemory} from "./dungeonThreatDecisions.ts";
import type {AdventurerState} from "./adventurers.ts";
import {generateAdventurer,useHealingSupplies} from "./adventurers.ts";
import {heroProgression,settleHeroExperience} from "./heroProgression.ts";
import {generateExpeditionLayout,dungeonDownStair,type DungeonPoint} from "./dungeonLayout.ts";
import {dungeonSiteGeneration} from "./dungeonRegeneration.ts";
import {claimSurveyorPlan} from "./dungeonDiscovery.ts";
import {recordFallenHeroes,recoverFallenAt} from "./fallenHeroes.ts";
import {chooseLiveHeroDungeonDecision,selectKnownResourceSite,carriedDungeonFindCount,
  salvageReturnThreshold,isBossExpeditionCandidate,isBossExpeditionParty,
  needsHealthResupply,unresolvedRecoveryPlan,canRiskOrdinaryDescent,
  type HeroDungeonDecision,type DungeonDecisionReason} from "./dungeonDecisions.ts";
import {choosePersistentDungeonParty,chooseBossRendezvous,negotiatePartyFloorDecisions,
  settlePersistentDungeonParties,temporaryPartyChanges,
  type DungeonPartyState} from "./dungeonParties.ts";
import {advanceSpatialDungeonPartyStep,emptySpatialDungeonWorld,
  prepareSpatialDungeonCombat,settleSpatialDungeonCombat,
  getSpatialDungeonProgress,chooseKnownRouteStep,chooseDungeonTransitionRoute,type PreparedSpatialEncounter,type SpatialDungeonReplay,
  type SpatialDungeonFloor,type SpatialDungeonWorld} from "./spatialDungeonExploration.ts";
import {createGroupCombat,stepGroupCombat,captureGroupCombatFrame,
  groupCombatReplayFromFrames,type GroupCombatState,
  type GroupReplayFrame,type GroupCombatOptions} from "./groupCombat.ts";
import {caveTrollPartyOptions} from "./sharedBossCombat.ts";
import {canAttemptCaveTroll,CAVE_TROLL_FLOOR} from "./dungeonTopology.ts";
import {appendCombatFrame} from "./combatRecording.ts";
import {returnUnpaidCartsAtClose} from "./shopCarts.ts";
import {scheduleShopVisit} from "./shopArrivals.ts";
import {commitShopRequestEvent} from "./shopRuntime.ts";
import {SeededRandom} from "./random.ts";
import {compactReplayFootage} from "./replayRetention.ts";
import {advanceWorldUntil,beginNextWorldDay,firstWorldTickOfDay,lastWorldTickOfDay,
  scheduleWorldEvent,type ScheduledWorldEvent} from "./worldClock.ts";

/** Gameplay tuning; this is not the legacy 36-steps-per-day solver.
 * One event = at most ONE spatial tile for each live party. At the current
 * pacing the cadence is now 2.5 unpaused real seconds; bed fast-forwards
 * remaining actual event ticks exactly once.
 */
export const DUNGEON_WORLD_EVENT_SUBJECT="dungeon-world";
export const LIVE_COMBAT_EVENT_SUBJECT="dungeon-combat";
/** Each clock event executes thirty genuine 60Hz fighter ticks in 0.5s. */
export const LIVE_COMBAT_INTERVAL_TICKS=10;
export const SHOP_PORTAL_RETURN_PREFIX="shop-return:";
/** The actual portal crossing takes one more game minute after backtracking. */
export const SHOP_PORTAL_TRANSIT_TICKS=20;

/** Optional, unsaved diagnostic observations. Only detached primitives and
 * fresh arrays/objects leave the real scheduler. Never feeds back into AI. */
export interface DungeonDiagnostic {
  readonly stage:"decision"|"combat-decision"|"boss-crossing"|"boss-route"|"depth-crossing"|"depth-route"|"boss-rendezvous";
  readonly day:number;
  readonly tick:number;
  readonly floor:number;
  readonly heroId:string;
  readonly memberIds:readonly string[];
  readonly checks:Readonly<Record<string,boolean>>;
  readonly action?:HeroDungeonDecision["action"];
  readonly goal?:HeroDungeonDecision["goal"];
  readonly reason?:DungeonDecisionReason;
}
export type DungeonDiagnosticSink=(sample:DungeonDiagnostic)=>void;

export interface LiveDungeonHeroStep {
  readonly heroId:string;
  readonly steps:number;
  /** Floor was exhausted or party retreated: re-evaluate next day. */
  readonly finished:boolean;
}
export interface LiveDungeonCombat {
  readonly id:string;
  readonly startedTick:number;
  readonly encounter:PreparedSpatialEncounter;
  readonly heroIds:readonly string[];
  readonly arrivals:readonly SpatialDungeonReplay[];
  readonly state:GroupCombatState;
  readonly frames:readonly GroupReplayFrame[];
}
/** A unique Level-10 group encounter; all heroes use the ONE 60Hz GroupCombat
 * motor and actual Cave Troll signature abilities, not the historical
 * solo Level-6 replay projection. */
export interface LivePartyBossCombat {
  readonly id:string;
  readonly startedTick:number;
  readonly heroIds:readonly string[];
  readonly options:GroupCombatOptions;
  readonly state:GroupCombatState;
  readonly frames:readonly GroupReplayFrame[];
}

export interface LiveDungeonReturn {
  readonly heroId:string;
  readonly fromFloor:SpatialDungeonFloor|10;
  readonly startedTick:number;
  /** Backtracking walks actual visited tiles; portal waits on a saved event. */
  readonly phase:"backtrack"|"portal";
  readonly dueTick?:number;
}
export interface LiveDungeonPlan {
  readonly heroId:string;
  readonly floor:SpatialDungeonFloor;
  readonly goal:HeroDungeonDecision["goal"];
  readonly action:HeroDungeonDecision["action"];
  readonly updatedTick:number;
  readonly threatMemory?:DungeonThreatMemory;
}
export interface LiveDungeonState {
  readonly enabled:boolean;
  readonly lastStepTick:number;
  readonly heroes:readonly LiveDungeonHeroStep[];
  readonly combatTick:number;
  readonly combats:readonly LiveDungeonCombat[];
  /** One canonical Level-10 party encounter. */
  readonly partyBossCombat?:LivePartyBossCombat|null;
  readonly returns:readonly LiveDungeonReturn[];
  /** Durable individual intentions, never player-issued party orders. */
  readonly plans:readonly LiveDungeonPlan[];
}
export const createLiveDungeonState=():LiveDungeonState=>({
  enabled:false,lastStepTick:0,heroes:[],combatTick:0,combats:[],
  returns:[],plans:[],
});

const eligible=(hero:AdventurerState)=>
  hero.health>0&&hero.status==="exploring"&&
    typeof hero.floor==="number"&&hero.floor>=1&&hero.floor<=9;
function nextDungeonTick(tick:number,day:number):number|null{
  const due=tick+DUNGEON_STEP_INTERVAL_TICKS;
  return due<=lastWorldTickOfDay(day)?due:null;
}
function queueNextDungeonWorldTick(state:GameState):GameState{
  if(!state.liveDungeon.enabled)return state;
  const due=nextDungeonTick(state.liveDungeon.lastStepTick,state.day);
  if(due===null)return state;
  if(state.worldClock.pending.some(event=>event.lane==="expedition"&&
      event.subjectId===DUNGEON_WORLD_EVENT_SUBJECT))
    throw new RangeError("Live dungeon cannot have two expedition clocks.");
  return {...state,worldClock:scheduleWorldEvent(
    state.worldClock,"expedition",due,DUNGEON_WORLD_EVENT_SUBJECT)};
}
/** Activate exclusive LIVE world-clock ownership. The legacy bedtime
 * dungeon resolver is not invoked at all on enabled campaigns.
 * Idempotent after save/load: never create a second pending event.
 */
export function activateLiveDungeon(state:GameState):GameState{
  if(state.liveDungeon.enabled)return state;
  if(state.worldClock.pending.some(event=>event.lane==="expedition"))
    throw new RangeError("Cannot activate a second dungeon event motor.");
  return queueNextDungeonWorldTick({...state,liveDungeon:{
    enabled:true,lastStepTick:state.worldClock.tick,heroes:[],
    combatTick:0,combats:[],returns:[],plans:[],
  }});
}

/** All currently active fights use one shared scheduled event, never
 * separate render or per-actor clock owners.
 */
function scheduleLiveCombat(state:GameState):GameState{
  if(!state.liveDungeon.combats.length&&!state.liveDungeon.partyBossCombat)return state;
  if(state.worldClock.pending.some(e=>e.lane==="expedition"&&
    e.subjectId===LIVE_COMBAT_EVENT_SUBJECT))
    throw new RangeError("Duplicate live combat clock event.");
  return {...state,worldClock:scheduleWorldEvent(state.worldClock,
    "expedition",state.worldClock.tick+LIVE_COMBAT_INTERVAL_TICKS,
    LIVE_COMBAT_EVENT_SUBJECT)};
}

function spatialWorld(state:GameState,floor:SpatialDungeonFloor):SpatialDungeonWorld{
  return dungeonWorldAt(state.dungeonWorlds,floor);
}
/** A hero crosses only after physically reaching the floor's entrance.
 * Both entrance and exit share Galvik's cursed portal, independent of
 * dungeon depth. The existing shop NPC movement owns its visible doorway.
 */
function beginPortalReturn(
  hero:AdventurerState,tick:number,clock:GameState["worldClock"],
  returns:readonly LiveDungeonReturn[],
):{hero:AdventurerState;clock:GameState["worldClock"];
  returns:LiveDungeonReturn[]} {
  if(returns.some(j=>j.heroId===hero.id&&j.phase==="portal"))
    throw new RangeError("Portal journey already active");
  const dueTick=tick+SHOP_PORTAL_TRANSIT_TICKS;
  const nextClock=scheduleWorldEvent(clock,"report",dueTick,
    SHOP_PORTAL_RETURN_PREFIX+hero.id);
  return {
    hero:{...hero,status:"traveling",floor:"transit",shopStayDays:0,
      lastDungeonFloor:hero.floor===10?9:
        hero.floor as AdventurerState["lastDungeonFloor"]},
    clock:nextClock,
    returns:[...returns.filter(j=>j.heroId!==hero.id),{
      heroId:hero.id,fromFloor:hero.floor as LiveDungeonReturn["fromFloor"],
      startedTick:tick,phase:"portal" as const,dueTick,
    }],
  };
}

function commitPortalReturn(state:GameState,event:ScheduledWorldEvent):GameState{
  if(event.lane!=="report"||!event.subjectId.startsWith(SHOP_PORTAL_RETURN_PREFIX))
    throw new RangeError("Unexpected portal return event.");
  const id=event.subjectId.slice(SHOP_PORTAL_RETURN_PREFIX.length);
  const journey=state.liveDungeon.returns.find(j=>j.heroId===id);
  const hero=state.adventurers.find(h=>h.id===id);
  if(!journey||journey.phase!=="portal"||
     journey.dueTick!==state.worldClock.tick||
     !hero||hero.status!=="traveling"||hero.floor!=="transit")
    throw new RangeError("Portal arrival lacks a committed physical return.");
  // Multiple genuine visits in a day are legal. The identity is tied
  // to the ONE consumed portal crossing, not to a lossy per-day hero flag.
  // Paid goods remain protected by the current physical visit ledger.
  const arrival:WorldEvent={
    id:"day-"+state.day+":"+id+":shop-arrival:"+state.worldClock.tick,
    type:"shop-arrival",day:state.day,worldTick:state.worldClock.tick,
    adventurerId:id,
    message:hero.name+" emerged through Galvik's portal into the shop.",
  };
  return {...state,adventurers:state.adventurers.map(h=>h.id===id?
      {...h,status:"at-shop" as const,floor:"shop" as const,shopStayDays:0}:h),
    liveDungeon:{...state.liveDungeon,
      returns:state.liveDungeon.returns.filter(j=>j.heroId!==id),
      plans:state.liveDungeon.plans.filter(p=>p.heroId!==id)},
    events:[...state.events,arrival],
  };
}

/** A medium-term intention belongs to the individual. Its tick changes
 * only on a genuine new decision; the Board can project it later without
 * inventing a new AI or exposing unseen encounter results.
 */
function recordLivePlan(
  plans:Map<string,LiveDungeonPlan>,hero:AdventurerState,
  decision:HeroDungeonDecision,tick:number,
):boolean {
  const previous=plans.get(hero.id);
  const changed=!previous||previous.floor!==hero.floor||
    previous.goal!==decision.goal||previous.action!==decision.action;
  if(changed)plans.set(hero.id,{
    heroId:hero.id,floor:hero.floor as SpatialDungeonFloor,
    goal:decision.goal,action:decision.action,updatedTick:tick,
    ...(previous?.floor===hero.floor&&previous.threatMemory?{threatMemory:previous.threatMemory}:{}),
  });
  return changed;
}
function actualStair(
  seed:number,floor:SpatialDungeonFloor,action:"ascend"|"descend",
):DungeonPoint {
  const layout=generateExpeditionLayout(seed,floor);
  return action==="ascend"?layout.entrance:dungeonDownStair(layout);
}
/** Settle a voluntary group using only saved, co-located willing heroes.
 * Both LIVE movement and combat termination call this same existing party
 * policy; no new party combat or movement engine is introduced.
 */
function settleLivePartyRelationships(
  prior:readonly DungeonPartyState[],encountered:readonly (readonly string[])[],
  roster:readonly AdventurerState[],worldForFloor:(floor:SpatialDungeonFloor)=>SpatialDungeonWorld,
  plans:ReadonlyMap<string,LiveDungeonPlan>,seed:number,day:number,tick:number,
):{parties:readonly DungeonPartyState[];events:WorldEvent[]} {
  const claimed=new Set(encountered.flat());
  const proposals=[
    ...encountered.filter(ids=>ids.length>=2),
    ...prior.filter(p=>p.memberIds.every(id=>!claimed.has(id)))
      .map(p=>p.memberIds),
  ];
  const actions=new Map(roster.filter(h=>eligible(h)).map(hero=>[
    hero.id,plans.get(hero.id)?.action??"stay",
  ] as const));
  const parties=settlePersistentDungeonParties(prior,proposals,roster,
    worldForFloor,seed,day,actions);
  const changes=temporaryPartyChanges(prior,parties.map(p=>p.memberIds),parties);
  const byId=new Map(roster.map(h=>[h.id,h]));
  const events:WorldEvent[]=changes.map(change=>({
    id:"day-"+day+":"+change.heroId+":temporary-party-"+change.action+":"+tick,
    type:change.action==="join"?"temporary-party-join":"temporary-party-leave",
    day,worldTick:tick,adventurerId:change.heroId,
    message:(byId.get(change.heroId)?.name??"An adventurer")+
      "'s temporary companionship changed during a live expedition.",
  }));
  return {parties,events};
}

/** A genuine magic death signal is emitted only when saved combat/trap
 * vitality crosses to zero. It reveals the hero and moment, NEVER remote
 * location, enemy, loot, or sealed battle outcome.
 */
function deathSignal(hero:AdventurerState,day:number,tick:number):WorldEvent {
  return {
    id:"day-"+day+":"+hero.id+":hero-death-signal:"+tick,
    type:"hero-death-signal",day,worldTick:tick,adventurerId:hero.id,
    message:hero.name+"'s life-signature has been extinguished.",
  };
}
const zone=(floor:number):"upper"|"deep"=>floor>=5?"deep":"upper";

function commitDungeonTick(state:GameState,diagnostic?:DungeonDiagnosticSink):GameState {
  const tick=state.worldClock.tick;
  const day=state.day;
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const processed=new Set(state.liveDungeon.combats.flatMap(c=>c.heroIds));
  for(const id of state.liveDungeon.partyBossCombat?.heroIds??[])processed.add(id);
  let partyBossCombat=state.liveDungeon.partyBossCombat??null;
  const combatSites=new Set(state.liveDungeon.combats.map(c=>
    c.encounter.floor+":"+c.encounter.featureId));
  const combats=[...state.liveDungeon.combats];
  let returns=[...state.liveDungeon.returns];
  let clock=state.worldClock;
  const plans=new Map(state.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const sharedGroups:string[][]=state.liveDungeon.combats
    .filter(c=>c.heroIds.length>=2).map(c=>[...c.heroIds]);
  const stepCounts=new Map(state.liveDungeon.heroes.map(v=>[v.heroId,v]));
  let dungeonWorlds=[...state.dungeonWorlds];
  let surveyorPlan=state.surveyorPlan;
  let fallenHeroes=state.fallenHeroes;
  const clearedLevel10=state.dungeonFloors.some(f=>
    f.floor===CAVE_TROLL_FLOOR&&f.cleared);
  let rngState=state.rngState;
  const activities:WorldEvent[]=[];
  const arrivalsByHero=new Map<string,SpatialDungeonReplay>();
  // Recover on the existing movement clock, never on a render timer or
  // a second daily simulation. A hero arrives at the real remembered
  // entrance and may first walk on the following ordinary movement tick.
  for(const hero of state.adventurers){
    if(hero.status!=="off-duty"||hero.offDutyUntilTick===null||
       hero.offDutyUntilTick>tick)continue;
    const healed=useHealingSupplies(hero,day,tick);
    // Only actual doses can improve vitality. If one dose was insufficient
    // and another is owned, finish treatment on a later existing world tick.
    // No indefinite wait, free recovery, or extra daily healing.
    if(healed.events.length&&needsHealthResupply(healed.adventurer)&&
      healed.adventurer.inventory.bread+healed.adventurer.inventory.healing>0){
      byId.set(hero.id,{...healed.adventurer,offDutyUntilTick:tick+1200});
      activities.push(...healed.events);
      continue;
    }
    const floor=hero.lastDungeonFloor??1;
    const ready:AdventurerState={...healed.adventurer,
      floor,status:"exploring",offDutyUntilTick:null};
    const layout=generateExpeditionLayout(state.seed,floor);
    const world=dungeonWorldAt(dungeonWorlds,floor);
    const spawn=layout.entrance,cell=spawn.z*layout.width+spawn.x;
    const old=world.heroes.find(h=>h.heroId===hero.id);
    const landed={heroId:hero.id,...spawn,visited:old?
      old.visited.includes(cell)?old.visited:[...old.visited,cell]:[cell]};
    dungeonWorlds=setDungeonWorld(dungeonWorlds,floor,{...world,
      heroes:[...world.heroes.filter(h=>h.heroId!==hero.id),landed]});
    byId.set(hero.id,ready);
    plans.delete(hero.id);
    const caution=unresolvedRecoveryPlan(ready);
    if(caution)recordLivePlan(plans,ready,caution,tick);
    stepCounts.delete(hero.id);
    processed.add(hero.id);
    activities.push(...healed.events,{
      id:`day-${day}:${hero.id}:dungeon-live:${tick}`,
      type:"dungeon-live",day,worldTick:tick,adventurerId:hero.id,
      reportedZone:zone(floor),
      message:hero.name+" began a new expedition after recovering outside the shop.",
    });
  }
  // Use roster order for stable, saved simultaneous encounter arbitration.
  // Shared sites are updated before the next party can inspect that tile.
  for(const original of state.adventurers){
    const hero=byId.get(original.id)!;
    if(!eligible(hero)||processed.has(hero.id)||
       stepCounts.get(hero.id)?.finished)continue;
    const floor=hero.floor as SpatialDungeonFloor;
    const world=dungeonWorldAt(dungeonWorlds,floor);
    const roster=state.adventurers.map(h=>byId.get(h.id)!);
    const layout=generateExpeditionLayout(state.seed,floor);
    const homeward=returns.find(j=>j.heroId===hero.id&&
      j.phase==="backtrack");
    const priorPlan=plans.get(hero.id);
    if(!homeward&&priorPlan?.floor===floor&&
      (priorPlan.action==="ascend"||priorPlan.action==="descend")&&
      ((priorPlan.action==="ascend"&&floor>1&&floor<=9)||
       (priorPlan.action==="descend"&&floor<10))){
      const target=actualStair(state.seed,floor,priorPlan.action);
      const at=getSpatialDungeonProgress(world,hero.id,layout);
      if(at.x===target.x&&at.z===target.z){
        // A staircase consumes this scheduled movement event; it may be
        // crossed only from the real saved tile. Co-located companions
        // who consented to the same direction cross TOGETHER.
        const nextFloor=(floor+(priorPlan.action==="ascend"?-1:1)) as SpatialDungeonFloor;
        const priorParty=(state.dungeonParties??[]).find(p=>
          p.floor===floor&&p.memberIds.includes(hero.id));
        const participants=priorParty?.memberIds.map(id=>byId.get(id)!)
          .filter(Boolean)??[hero];
        const crossing=participants.length>1&&participants.every(member=>{
          const plan=plans.get(member.id);
          const pos=getSpatialDungeonProgress(world,member.id,layout);
          return !processed.has(member.id)&&eligible(member)&&
            member.floor===floor&&plan?.action===priorPlan.action&&
            pos.x===target.x&&pos.z===target.z&&
            !returns.some(r=>r.heroId===member.id);
        })?participants:[hero];
        // A previously chosen descent can become stale after a real
        // supply use or injury. Reuse the same current readiness decision
        // before committing the ordinary physical crossing.
        if(floor<9&&priorPlan.action==="descend"&&
          crossing.some(member=>!canRiskOrdinaryDescent(member))){
          for(const member of crossing)
            if(!canRiskOrdinaryDescent(member))plans.delete(member.id);
          processed.add(hero.id);
          continue;
        }
        if(floor===9&&priorPlan.action==="descend"){
          // A genuine saved temporary party physically reaches Floor 9's
          // lower stair together. No solo explorer can spawn a fake team.
          const hasSavedParty=!!priorParty;
          const fullCrossing=!!priorParty&&crossing.length===priorParty.memberIds.length;
          const allowedParty=canAttemptCaveTroll(crossing.length)&&isBossExpeditionParty(crossing);
          const living=crossing.every(member=>member.health>0);
          const partyValid=hasSavedParty&&fullCrossing&&allowedParty&&living&&
            !partyBossCombat&&!clearedLevel10;
          // A real encounter may continue across the shop day boundary.
          const hasTime=true;
          diagnostic?.({stage:"boss-crossing",day,tick,floor,heroId:hero.id,
            memberIds:participants.map(member=>member.id),checks:{
              savedParty:hasSavedParty,fullCrossing,
              partySize:crossing.length>=2&&crossing.length<=3,
              ready:crossing.every(isBossExpeditionCandidate),living,
              bossIdle:!partyBossCombat,bossUncleared:!clearedLevel10,
              hasTime,accepted:partyValid&&hasTime,
            }});
          if(!partyValid||!hasTime){
            processed.add(hero.id);
            stepCounts.set(hero.id,{heroId:hero.id,
              steps:(stepCounts.get(hero.id)?.steps??0)+1,
              finished:!hasTime});
            if(!partyValid)plans.delete(hero.id);
            continue;
          }
          const rng=new SeededRandom(rngState);
          const tacticsSeed=rng.int(32);
          rngState=rng.state;
          const options=caveTrollPartyOptions(crossing,tacticsSeed);
          const combat=createGroupCombat(options);
          const members=crossing.map(member=>member.id);
          partyBossCombat={
            id:"party-boss:"+day+":"+tick+":"+members.join("+"),
            startedTick:tick,heroIds:members,options,state:combat,
            frames:[captureGroupCombatFrame(combat)],
          };
          for(const member of crossing){
            byId.set(member.id,{...member,floor:CAVE_TROLL_FLOOR,
              status:"expedition" as const});
            plans.delete(member.id);
            processed.add(member.id);
            stepCounts.set(member.id,{heroId:member.id,
              steps:(stepCounts.get(member.id)?.steps??0)+1,finished:true});
            activities.push({
              id:"day-"+day+":"+member.id+":dungeon-live:"+tick,
              type:"dungeon-live",day,worldTick:tick,
              adventurerId:member.id,reportedZone:"deep",
              dungeonGoal:"progress",floorAction:"descend",
              message:crossing.map(h=>h.name).join(", ")+
                " entered Floor 10 together to challenge the Cave Troll.",
            });
          }
          continue;
        }
        diagnostic?.({stage:"depth-crossing",day,tick,floor,heroId:hero.id,
          memberIds:crossing.map(member=>member.id),action:priorPlan.action,
          checks:{accepted:true,partyTogether:crossing.length>1,
            fullParty:!priorParty||crossing.length===participants.length}});
        const destinationLayout=generateExpeditionLayout(state.seed,nextFloor);
        const arrival=priorPlan.action==="ascend"
          ?dungeonDownStair(destinationLayout):destinationLayout.entrance;
        const previousWorld=dungeonWorldAt(dungeonWorlds,nextFloor);
        const nextHeroes=[...previousWorld.heroes];
        for(const member of crossing){
          const old=nextHeroes.find(p=>p.heroId===member.id);
          const cell=arrival.z*destinationLayout.width+arrival.x;
          const arrived=old?{...old,...arrival,
            visited:old.visited.includes(cell)?old.visited:[...old.visited,cell]}
            :{heroId:member.id,...arrival,visited:[cell]};
          const oldIndex=nextHeroes.findIndex(p=>p.heroId===member.id);
          if(oldIndex<0)nextHeroes.push(arrived);
          else nextHeroes[oldIndex]=arrived;
          const arrivedHero={...member,floor:nextFloor};
          byId.set(member.id,arrivedHero);
          const wasCautious=plans.get(member.id)?.goal==="caution";
          plans.delete(member.id);
          const caution=wasCautious?unresolvedRecoveryPlan(arrivedHero):null;
          if(caution)recordLivePlan(plans,arrivedHero,caution,tick);
          processed.add(member.id);
          stepCounts.set(member.id,{heroId:member.id,
            steps:(stepCounts.get(member.id)?.steps??0)+1,finished:false});
          activities.push({
            id:"day-"+day+":"+member.id+":dungeon-live:"+tick,
            type:"dungeon-live",day,worldTick:tick,adventurerId:member.id,
            reportedZone:zone(nextFloor),
            dungeonGoal:priorPlan.goal,floorAction:priorPlan.action,
            message:member.name+"'s expedition changed depth. Details await a report.",
          });
        }
        dungeonWorlds=setDungeonWorld(dungeonWorlds,nextFloor,{...previousWorld,heroes:nextHeroes});
        if(crossing.length>=2)sharedGroups.push(crossing.map(h=>h.id));
        continue;
      }
    }
    if(homeward){
      const current=getSpatialDungeonProgress(world,hero.id,layout);
      if(current.x===layout.entrance.x&&current.z===layout.entrance.z){
        const journey=beginPortalReturn(hero,tick,clock,returns);
        byId.set(hero.id,journey.hero);
        clock=journey.clock;returns=journey.returns;
        plans.delete(hero.id);
        processed.add(hero.id);
        stepCounts.set(hero.id,{heroId:hero.id,
          steps:(stepCounts.get(hero.id)?.steps??0)+1,finished:true});
        continue;
      }
    }
    const returningIds=new Set(returns.map(j=>j.heroId));
    // Returners never get recruited and then silently removed from a party.
    // On Floor 9, ready boss seekers and ordinary explorers voluntarily
    // form compatible groups instead of dragging one another into the gate.
    const availableRoster=roster.filter(member=>member.id===hero.id||
      !returningIds.has(member.id)&&!stepCounts.get(member.id)?.finished&&
      (floor!==9||clearedLevel10||
        isBossExpeditionCandidate(member)===isBossExpeditionCandidate(hero)));
    const group=homeward?[hero]:choosePersistentDungeonParty(hero,availableRoster,world,layout,
      processed,state.dungeonParties??[]);
    const readyGroup=group.filter(member=>!stepCounts.get(member.id)?.finished);
    if(!readyGroup.length)continue;
    const occupied=new Set(roster.filter(member=>
      member.floor===floor&&eligible(member)).map(member=>member.id));
    const blocked=new Set([...combatSites].filter(key=>
      key.startsWith(floor+":")).map(key=>key.slice((floor+":").length)));
    const directed=priorPlan?.floor===floor&&
      (priorPlan.action==="ascend"||priorPlan.action==="descend")&&
      ((priorPlan.action==="ascend"&&floor>1&&floor<=9)||
       (priorPlan.action==="descend"&&floor<10))
      ?actualStair(state.seed,floor,priorPlan.action):undefined;
    // A saved autonomous loot/hunt intention may redirect a step only to a
    // personally known, still-active chest/monster site. Never let the
    // omniscient spectator map plan hero movement.
    const known=getSpatialDungeonProgress(world,hero.id,layout);
    const resourceKind=priorPlan?.floor===floor?
      priorPlan.goal==="loot-chest"?"treasure":
      priorPlan.goal==="hunt-ghouls"?"monster":null:null;
    const candidate=resourceKind&&!homeward&&!directed
      ?selectKnownResourceSite(layout,known,world,resourceKind,readyGroup):null;
    const resourceTarget=candidate&&!blocked.has(candidate.id)?candidate:null;
    // A visible real pursuer may change ONE scheduled map step. This pure
    // tactical decision uses only the group's own current LOS and known
    // nearby allies, never spectator selections or hidden monster positions.
    // A returning hero still sees genuine pursuers. Their previously
    // committed backtrack remains saved; a single safe tactical dodge can
    // interrupt one step without cancelling the shop-bound journey.
    const threat=chooseDungeonThreatReaction(
      layout,world,readyGroup,roster,!!homeward,
      readyGroup.some(member=>plans.get(member.id)?.goal==="caution"&&needsHealthResupply(member)));
    const route=diagnostic&&directed&&priorPlan?.action==="descend"
      ?chooseDungeonTransitionRoute(layout,readyGroup.map(member=>
        getSpatialDungeonProgress(world,member.id,layout)),directed):null;
    // Seek a visible eligible peer, or the real lower stair as a common
    // landmark. A solo search does not acquire a descend plan or cross.
    const seeking=!homeward&&!clearedLevel10&&readyGroup.length===1&&
      isBossExpeditionCandidate(hero)&&priorPlan?.action!=="ascend"&&priorPlan?.action!=="shop";
    const busy=seeking?new Set([...returns.map(j=>j.heroId),
      ...combats.flatMap(c=>c.heroIds),...(partyBossCombat?.heroIds??[]),
      ...[...stepCounts.values()].filter(c=>c.finished).map(c=>c.heroId),
      ...(state.dungeonParties??[]).filter(p=>p.memberIds.length>=2&&
        !p.memberIds.includes(hero.id)&&isBossExpeditionParty(p.memberIds.map(id=>byId.get(id)!).filter(Boolean)))
        .flatMap(p=>p.memberIds)]):null;
    const rendezvous=busy?chooseBossRendezvous(hero,roster,world,layout,busy):null;
    const rally=seeking?dungeonDownStair(layout):undefined;
    const atRally=!!rally&&known.x===rally.x&&known.z===rally.z;
    // Wait for other actual explorers at the lower stair, but eventually
    // abandon a fruitless day of waiting and allow normal resupply.
    const waiting=!!rendezvous&&!rendezvous.step||
      atRally&&!rendezvous&&tick<lastWorldTickOfDay(day)-12*DUNGEON_STEP_INTERVAL_TICKS;
    const target=directed??rally;
    const oldMemory=recentDungeonThreat(readyGroup.map(h=>plans.get(h.id)?.threatMemory),tick);
    const seen=threat&&threat.action!=="PREPARING_TO_FIGHT"
      ?world.monsters?.find(m=>m.id===threat.monsterId):undefined;
    const memory=seen?{monsterId:seen.id,x:seen.x,z:seen.z,seenTick:tick}:oldMemory;
    const remembered=!threat?chooseRememberedThreatReaction(layout,world,readyGroup,memory,
      directed??rally??resourceTarget??undefined,!!homeward):null;
    const tactical=threat?.step??remembered?.step??(!remembered?rendezvous?.step:undefined);
    let result=advanceSpatialDungeonPartyStep(readyGroup,world,state.seed,day,occupied,
      {deferCombat:true,deferReturn:true,returnToEntrance:!!homeward,
        ...(target?{routeToKnownTarget:target}:{}),
        ...(resourceTarget&&!seeking?{routeToResource:resourceTarget}:{}),
        ...(tactical?{tacticalStep:tactical}:{}),
        ...((waiting||remembered&&!remembered.step)&&!tactical?{waitForCompanion:true}:{}),
        blockedCombatSites:blocked});
    if(diagnostic&&seeking){
      const next=result.world.heroes.find(p=>p.heroId===hero.id);
      diagnostic({stage:"boss-rendezvous",day,tick,floor,heroId:hero.id,
        memberIds:rendezvous?[hero.id,rendezvous.peerId]:[hero.id],
        action:"stay",goal:"progress",reason:"seek-boss-party",checks:{
          visiblePeer:!!rendezvous,waiting:waiting&&!tactical,atRally,
          tacticalOverride:!!threat,
          moved:!!next&&(next.x!==known.x||next.z!==known.z),
        }});
    }
    if(diagnostic&&route&&directed){
      const next=result.world.heroes.find(p=>p.heroId===hero.id);
      const moved=!!next&&(next.x!==known.x||next.z!==known.z);
      diagnostic({stage:floor===9?"boss-route":"depth-route",day,tick,floor,heroId:hero.id,
        action:"descend",memberIds:readyGroup.map(member=>member.id),checks:{
          stairVisited:known.visited.includes(directed.z*layout.width+directed.x),
          // Preserve the baseline's individual walked-route metric below;
          // separately identify the new party and perception-aware route.
          knownRoute:known.x===directed.x&&known.z===directed.z||
            !!chooseKnownRouteStep(layout,known,directed),
          usableRoute:route.kind==="at-stair"||route.kind==="walked-route"||route.kind==="observed-route",
          walkedRoute:route.kind==="walked-route",
          observedRoute:route.kind==="observed-route",
          frontier:route.kind==="frontier",blocked:route.kind==="blocked",
          atStair:route.kind==="at-stair",
          tacticalOverride:!!threat&&(!route.step||
            threat.step.x!==route.step.x||threat.step.z!==route.step.z),
          moved,newPersonalTile:!!next&&next.visited.length>known.visited.length,
          reachedStair:!!next&&next.x===directed.x&&next.z===directed.z,
        }});
    }
    if(readyGroup.length>=2)
      sharedGroups.push(readyGroup.map(member=>member.id));
    if(result.pendingCombat){
      const encounter=result.pendingCombat;
      const siteKey=floor+":"+encounter.featureId;
      if(combatSites.has(siteKey))throw new RangeError("Duplicate live monster reservation.");
      combatSites.add(siteKey);
      const fight=createGroupCombat(encounter.options);
      combats.push({id:"battle:"+day+":"+tick+":"+floor+":"+encounter.featureId,
        startedTick:tick,encounter,heroIds:readyGroup.map(h=>h.id),
        arrivals:result.ticks.map(t=>t.replay),state:fight,
        frames:[captureGroupCombatFrame(fight)]});
    }
    dungeonWorlds=setDungeonWorld(dungeonWorlds,floor,result.world);
    const previousDiscovery=surveyorPlan;
    fallenHeroes=recordFallenHeroes(fallenHeroes,result,day);
    // A fallen carrier leaves the unique plan at the body. The old chest
    // must not regenerate another copy while those remains are reachable.
    if(!surveyorPlan||!fallenHeroes.some(f=>f.heroId===surveyorPlan?.heroId))
      surveyorPlan=claimSurveyorPlan(surveyorPlan,state.seed,day,result,[...byId.values()]);
    // Opportunistic recovery on actual movement only, never during a
    // reserved encounter, a fatal trap or a tactical threat response.
    if(!result.pendingCombat&&!threat&&!remembered&&
       result.ticks.every(t=>t.adventurer.health>0)){
      result={...result,ticks:result.ticks.map(t=>{
        const position=result.world.heroes.find(p=>p.heroId===t.adventurer.id);
        if(!position||!t.replay.steps.some(s=>s.action==="walk"))return t;
        if(result.world.monsters?.some(m=>Math.abs(m.x-position.x)+Math.abs(m.z-position.z)<=1))return t;
        const recovered=recoverFallenAt(fallenHeroes,byId,t.adventurer,position,surveyorPlan);
        surveyorPlan=recovered.plan;
        recovered.deceased.forEach(h=>byId.set(h.id,h));
        return recovered.hero===t.adventurer?t:{...t,adventurer:recovered.hero};
      })};
    }
    const newFinder=surveyorPlan!==previousDiscovery?surveyorPlan?.heroId:undefined;
    const independent=new Map<string,HeroDungeonDecision>();
    const decisionDetails=diagnostic?new Map<string,{
      checks:Record<string,boolean>;reason?:DungeonDecisionReason}>():undefined;
    const bossReady=!clearedLevel10&&isBossExpeditionParty(
      result.ticks.map(t=>t.adventurer).filter(h=>h.health>0));
    if(!result.pendingCombat)for(const individual of result.ticks){
      if(individual.adventurer.health<=0)continue;
      const progress=result.world.heroes.find(p=>
        p.heroId===individual.adventurer.id);
      const detail=decisionDetails?{checks:{
        partySize:readyGroup.length>=2&&readyGroup.length<=3,
        ready:readyGroup.every(isBossExpeditionCandidate),
        armed:readyGroup.every(member=>member.equipment.weapon!==null),
        partyHealth:readyGroup.every(member=>member.health/heroProgression(member).maxHealth>=.60),
        visitedEnough:(progress?.visited.length??0)>=13,
        heroHealth:individual.adventurer.health/heroProgression(individual.adventurer).maxHealth>=.60,
        bossCandidate:isBossExpeditionCandidate(individual.adventurer),
        largerHaul:salvageReturnThreshold(individual.adventurer)>4,
        deferredFreshHaul:carriedDungeonFindCount(individual.adventurer)>=4&&
          carriedDungeonFindCount(individual.adventurer)<salvageReturnThreshold(individual.adventurer)&&
          carriedDungeonFindCount(individual.adventurer)>carriedDungeonFindCount(byId.get(individual.adventurer.id)!),
        bossReady,
      }} as {checks:Record<string,boolean>;reason?:DungeonDecisionReason}:undefined;
      independent.set(individual.adventurer.id,
        individual.adventurer.id===newFinder?{goal:"resupply",action:"shop"}:
        chooseLiveHeroDungeonDecision(individual.adventurer,
          progress,individual.replay,layout,result.world,bossReady,
          carriedDungeonFindCount(byId.get(individual.adventurer.id)!),
          detail?(reason)=>{detail.reason=reason;}:undefined,
          plans.get(individual.adventurer.id),!clearedLevel10,
          byId.get(individual.adventurer.id)!.health,tick));
      if(detail)decisionDetails!.set(individual.adventurer.id,detail);
    }
    const agreed=readyGroup.length>1
      ?negotiatePartyFloorDecisions(result.ticks.map(t=>t.adventurer),
        independent):independent;
    for(const individual of result.ticks){
      const id=individual.adventurer.id;
      arrivalsByHero.set(id,individual.replay);
      const count=(stepCounts.get(id)?.steps??0)+1;
      processed.add(id);
      byId.set(id,individual.adventurer);
      const chosen=agreed.get(id);
      const withdrawing=!!remembered&&(remembered.retreatUp||
        priorPlan?.action==="ascend"&&priorPlan.goal==="caution");
      const decision=chosen&&withdrawing&&!homeward&&chosen.action!=="shop"
        ?{goal:"caution" as const,action:"ascend" as const}:chosen;
      const detail=decisionDetails?.get(id);
      if(diagnostic&&decision&&detail&&!homeward)
        diagnostic({stage:"decision",day,tick,floor,heroId:id,
          memberIds:readyGroup.map(member=>member.id),
          checks:{...detail.checks,partyChangedAction:decision.action!==independent.get(id)?.action},
          action:decision.action,goal:decision.goal,reason:detail.reason});
      const planChanged=decision&&!homeward
        ?recordLivePlan(plans,individual.adventurer,decision,tick):false;
      const savedPlan=plans.get(id);
      if(savedPlan&&memory&&individual.adventurer.status==="exploring"&&
        (seen||remembered))plans.set(id,{...savedPlan,threatMemory:memory});
      else if(savedPlan?.threatMemory&&(!memory||threat?.action==="PREPARING_TO_FIGHT"||!remembered&&!seen)){
        const {threatMemory:_expired,...rest}=savedPlan;plans.set(id,rest);
      }
      if(individual.adventurer.status==="dead"){
        if(hero.health>0)
          activities.push(deathSignal(individual.adventurer,day,tick));
        returns=returns.filter(j=>j.heroId!==id);
        plans.delete(id);
      } else if(!result.pendingCombat){
        const progress=result.world.heroes.find(p=>p.heroId===id);
        const existing=returns.find(j=>j.heroId===id&&j.phase==="backtrack");
        if(!existing&&decision?.action==="shop")
          returns.push({heroId:id,fromFloor:floor,
            startedTick:tick,phase:"backtrack"});
        if((existing||returns.some(j=>j.heroId===id&&j.phase==="backtrack"))&&
           progress?.x===layout.entrance.x&&progress?.z===layout.entrance.z){
          const journey=beginPortalReturn(individual.adventurer,tick,clock,returns);
          clock=journey.clock;returns=journey.returns;
          byId.set(id,journey.hero);
          plans.delete(id);
        }
      }
      const highlight=individual.replay.steps.some(s=>s.action==="treasure")
        ?"treasure" as const:individual.replay.steps.some(s=>s.action==="trap")
          ?"trap" as const:null;
      const important=individual.replay.steps.some(s=>
        s.action==="treasure"||s.action==="trap"||
        s.action==="combat"||s.action==="death");
      const committedHero=byId.get(id)!;
      const wantsTravel=returns.some(r=>r.heroId===id&&r.phase==="backtrack")||
        (decision?.action==="ascend"&&floor>1&&floor<=9)||
        (decision?.action==="descend"&&floor<10);
      const stopped=committedHero.status==="dead"||
        committedHero.status==="traveling"||
        (individual.replay.outcome!=="exploring"&&!wantsTravel);
      stepCounts.set(id,{heroId:id,steps:count,finished:stopped});
      if(important||stopped||planChanged){
        // The merchant knows that the magic life-signature changed, but not
        // details of unseen loot or battles. Actual facts remain in the
        // saved dungeon world, never in an invented shop report.
        activities.push({
          id:`day-${day}:${id}:dungeon-live:${tick}`,
          type:"dungeon-live",day,worldTick:tick,adventurerId:id,
          reportedZone:zone(floor),
           ...(highlight?{dungeonHighlight:highlight}:{}),
          ...(decision?{dungeonGoal:decision.goal,floorAction:decision.action}:{}),
          // A fatal trap previously saved ONLY the magical loss signal and
          // threw away the actual spatial frames. The player cannot watch
          // a recording that was never persisted. Retain the immutable
          // already-resolved death tape ONLY for genuine dead adventurers;
          // no additional simulation, RNG, AI or routine-step save bloat.
          ...(individual.adventurer.status==="dead"?
            {dungeonReplay:individual.replay}:{}),
          message:`${individual.adventurer.name}'s expedition changed. Details await a report.`,
        });
      }
    }
  }
  const finalRoster=state.adventurers.map(hero=>byId.get(hero.id)!);
  // Advance every ordinary floor from the SAME scheduled world event.
  // Offscreen packs never wait for the spectator or Galvik's Table.
  for(let floor=1;floor<=9;floor++){
    const ordinary=floor as SpatialDungeonFloor;
    const layout=generateExpeditionLayout(state.seed,ordinary);
    const world=dungeonWorldAt(dungeonWorlds,ordinary);
    const activeHeroes=finalRoster.filter(h=>eligible(h)&&h.floor===ordinary)
      .map(h=>getSpatialDungeonProgress(world,h.id,layout));
    const reserved=new Set(combats.filter(c=>c.encounter.floor===ordinary)
      .map(c=>c.encounter.featureId));
    const advanced=advanceDungeonMonsterWorld(world,layout,day,tick,
      activeHeroes,reserved);
    let committed=advanced;
    // Contact arbitration runs AFTER every scheduled hero and pack movement,
    // on the same clock tick. Existing hero-arrival combats already own their
    // sites; only unreserved packs can initiate another real GroupCombat.
    const fighting=new Set(combats.flatMap(combat=>combat.heroIds));
    for(const pack of advanced.monsters??[]){
      if(reserved.has(pack.id))continue;
      const at=finalRoster.filter(hero=>eligible(hero)&&hero.floor===ordinary&&
        !fighting.has(hero.id)&&
        activeHeroes.some(progress=>progress.heroId===hero.id&&
          progress.x===pack.x&&progress.z===pack.z))
        .sort((a,b)=>a.id.localeCompare(b.id));
      if(!at.length)continue;
      const leader=at[0];
      const savedParty=(state.dungeonParties??[]).find(group=>
        group.floor===ordinary&&group.memberIds.includes(leader.id));
      const participants=savedParty
        ?savedParty.memberIds.map(id=>at.find(hero=>hero.id===id))
          .filter((hero):hero is AdventurerState=>!!hero)
        :[leader];
      if(!participants.length)continue;
      const feature=layout.features.find(site=>
        site.kind==="monster"&&site.id===pack.id);
      if(!feature)throw new RangeError("Roaming pack has no source feature");
      const encounterSite=ordinary+":"+feature.id;
      if(combatSites.has(encounterSite))continue;
      const atPoint={x:pack.x,z:pack.z};
      // A hero may be physically standing at the entrance before their
      // first individual walking checkpoint. Preserve the true on-floor
      // entry position before reserving a monster-initiated contact fight.
      const newlyRecorded=participants.map(hero=>
        getSpatialDungeonProgress(committed,hero.id,layout)).filter(progress=>
        !committed.heroes.some(saved=>saved.heroId===progress.heroId));
      if(newlyRecorded.length)committed={
        ...committed,heroes:[...committed.heroes,...newlyRecorded],
      };
      const arrivals:SpatialDungeonReplay[]=participants.map(hero=>{
        const old=arrivalsByHero.get(hero.id);
        const progress=getSpatialDungeonProgress(committed,hero.id,layout);
        const saved=old?.floor===ordinary&&old.outcome==="exploring"&&
          old.steps.at(-1)?.x===pack.x&&old.steps.at(-1)?.z===pack.z
          ?old:null;
        const base:SpatialDungeonReplay=saved??{
          version:1,day,heroId:hero.id,floor:ordinary,
          appearance:{role:hero.role,equipment:{...hero.equipment}},
          knownAtStart:[...progress.visited],
          resolvedAtStart:[...committed.resolvedFeatureIds],
          steps:[{...atPoint,t:0,action:"enter",hp:hero.health}],
          encounters:[],outcome:"exploring",
          ...(participants.length>1?{
            partyMemberIds:participants.map(member=>member.id),
            partyAppearances:participants.map(member=>({
              id:member.id,role:member.role,equipment:{...member.equipment},
            })),
          }:{}),
        };
        const last=base.steps.at(-1)!;
        return {...base,steps:[...base.steps,{
          ...atPoint,t:last.t+0.1,action:"combat" as const,
          hp:hero.health,featureId:pack.id,
        }]};
      });
      const start=arrivals[0].steps[0];
      const prepared=prepareSpatialDungeonCombat(participants,
        {...feature,...atPoint},layout.seed,layout,start,
        dungeonSiteGeneration(committed.siteCycles,feature.id),true);
      const encounter:PreparedSpatialEncounter={
        featureId:feature.id,floor:ordinary,...atPoint,
        siteCycle:pack.siteCycle,...prepared,
      };
      const fight=createGroupCombat(encounter.options);
      combatSites.add(encounterSite);reserved.add(feature.id);
      participants.forEach(hero=>fighting.add(hero.id));
      if(participants.length>1)
        sharedGroups.push(participants.map(hero=>hero.id));
      combats.push({
        id:"battle:"+day+":"+tick+":"+ordinary+":"+feature.id,
        startedTick:tick,encounter,
        heroIds:participants.map(hero=>hero.id),arrivals,
        state:fight,frames:[captureGroupCombatFrame(fight)],
      });
      committed={...committed,monsters:committed.monsters?.map(monster=>{
        if(monster.id!==pack.id)return monster;
        const {target:_target,targetHeroId:_targetHeroId,
          lastKnown:_lastKnown,lastSeenTick:_lastSeenTick,
          lostSightChecks:_lostSightChecks,...rest}=monster;
        return {...rest,mode:"ENGAGED" as const};
      })};
    }
    dungeonWorlds=setDungeonWorld(dungeonWorlds,ordinary,committed);
  }
  const party=settleLivePartyRelationships(state.dungeonParties??[],
    sharedGroups,finalRoster,floor=>dungeonWorldAt(dungeonWorlds,floor),plans,state.seed,day,tick);
  const next:GameState={
    ...state,worldClock:clock,
    dungeonParties:party.parties,
    adventurers:finalRoster,
    surveyorPlan,fallenHeroes,
    dungeonWorlds,
    rngState,
    liveDungeon:{enabled:true,lastStepTick:tick,
      heroes:[...stepCounts.values()],
      combatTick:combats.length||partyBossCombat?
        state.liveDungeon.combatTick||tick:0,
      combats,partyBossCombat,returns,plans:[...plans.values()]},
    events:[...state.events,...activities,...party.events],
  };
  const scheduled=queueNextDungeonWorldTick(next);
  const previouslyActive=state.liveDungeon.combats.length>0||
    !!state.liveDungeon.partyBossCombat;
  return previouslyActive||!(combats.length||partyBossCombat)?scheduled:
    scheduleLiveCombat(scheduled);
}

/** Shared immutable checkpoint advance and replay capture for every LIVE
 * encounter. Only the combat motor determines the outcome. */
function advanceLiveEncounter(
  encounter:Pick<LiveDungeonCombat,"state"|"frames"|"heroIds">,
):{combat:GroupCombatState;frames:GroupReplayFrame[];newDeaths:string[]}{
  const combat:GroupCombatState=structuredClone(encounter.state);
  const frames=[...encounter.frames];
  for(let i=0;i<LIVE_COMBAT_INTERVAL_TICKS*3&&combat.outcome==="fighting";i++){
    const step=Math.round(combat.time*60)+1;
    stepGroupCombat(combat);
    if(step%6===0||combat.outcome!=="fighting")
      appendCombatFrame(frames,captureGroupCombatFrame(combat));
  }
  const newDeaths=encounter.heroIds.filter(id=>{
    const before=encounter.state.actors.find(a=>a.id===id);
    const after=combat.actors.find(a=>a.id===id);
    return before&&after&&before.hp>0&&after.hp<=0;
  });
  return {combat,frames,newDeaths};
}

/** Run the existing 60Hz group engine on the saved world timeline.
 * Every scheduled 0.5s event advances exactly 30 ticks, or fewer if
 * the fight ends. Read-only replays NEVER call this function.
 */
function commitLiveCombatTick(state:GameState,diagnostic?:DungeonDiagnosticSink):GameState{
  if(!(state.liveDungeon.combats.length||
      state.liveDungeon.partyBossCombat)||
     state.worldClock.tick!==state.liveDungeon.combatTick+LIVE_COMBAT_INTERVAL_TICKS)
    throw new RangeError("Unscheduled live battle advance.");
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const counts=new Map(state.liveDungeon.heroes.map(h=>[h.heroId,h]));
  let dungeonWorlds=[...state.dungeonWorlds];
  let fallenHeroes=state.fallenHeroes;
  const activities:WorldEvent[]=[];
  const continuing:LiveDungeonCombat[]=[];
  let returns=[...state.liveDungeon.returns];
  let clock=state.worldClock;
  let rngState=state.rngState;
  let partyBossCleared=false;
  const plans=new Map(state.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const sharedGroups:string[][]=state.liveDungeon.combats
    .filter(c=>c.heroIds.length>=2).map(c=>[...c.heroIds]);
  let partyBossContinuing:LivePartyBossCombat|null=null;
  const partyBoss=state.liveDungeon.partyBossCombat;
  // A map event and an already scheduled combat burst can share a tick.
  // The burst closes the PRECEDING half-second, so a newly arrived party
  // must retain its initial frame and begin advancing at the next burst.
  if(partyBoss?.startedTick===state.worldClock.tick){
    partyBossContinuing=partyBoss;
  }else if(partyBoss){
    const {combat,frames,newDeaths}=advanceLiveEncounter(partyBoss);
    for(const id of newDeaths){
      const hero=byId.get(id);
      if(!hero)throw new RangeError("Boss fighter has no original hero.");
      activities.push(deathSignal(hero,state.day,state.worldClock.tick));
    }
    if(combat.outcome==="fighting"){
      partyBossContinuing={...partyBoss,state:combat,frames};
    }else{
      const winner=combat.outcome==="heroes";
      if(winner)partyBossCleared=true;
      const living=partyBoss.heroIds.filter(id=>
        (combat.actors.find(a=>a.id===id)?.hp??0)>0).sort();
      const rewardPot=winner?60:0;
      const recording=groupCombatReplayFromFrames(
        partyBoss.options,combat,frames);
      for(const id of partyBoss.heroIds){
        const old=byId.get(id),actor=combat.actors.find(a=>a.id===id);
        if(!old||!actor)
          throw new RangeError("Boss settlement lost a real party actor.");
        const hp=Math.max(0,Math.round(actor.hp));
        const initial=partyBoss.options.actors.find(a=>a.id===id);
        if(!initial)throw new RangeError("Boss settlement lost initial resources.");
        const used=(initial.healCharges??0)-actor.healCharges;
        if(used<0||used>old.inventory.healing)
          throw new RangeError("Boss fight invented a healing supply.");
        const gold=winner&&hp>0?
          Math.floor(rewardPot/living.length)+
            (living.indexOf(id)<rewardPot%living.length?1:0):0;
        const next=settleHeroExperience(old,old.xp+
          (winner&&hp>0?120:0),hp);
        const hero:AdventurerState={...next,
          status:hp>0?"expedition":"dead",
          gold:old.gold+gold,
          // The victory pays genuine gold and XP, not an imaginary
          // abstract chest token masquerading as a physical reward.
          inventory:{...old.inventory,healing:old.inventory.healing-used},
        };
        byId.set(id,hero);
        activities.push({
          id:"day-"+state.day+":"+id+":dungeon-live:"+state.worldClock.tick,
          type:"dungeon-live",day:state.day,worldTick:state.worldClock.tick,
          adventurerId:id,reportedZone:"deep",
          ...(id===partyBoss.heroIds[0]?{partyBossReplay:recording}:{}),
          message:old.name+(winner?" survived the Level-10 Cave Troll's defeat.":
            hp<=0?" was slain challenging the Level-10 Cave Troll.":
              " escaped the Level-10 Cave Troll with injuries."),
        });
        if(hp>0){
          const journey=beginPortalReturn(hero,state.worldClock.tick,
            clock,returns);
          byId.set(id,journey.hero);
          clock=journey.clock;returns=journey.returns;
        }
      }
    }
  }
  for(const fight of state.liveDungeon.combats){
    if(fight.startedTick===state.worldClock.tick){
      continuing.push(fight);
      continue;
    }
    const {combat,frames,newDeaths}=advanceLiveEncounter(fight);
    for(const id of newDeaths){
      const hero=byId.get(id);
      if(!hero)throw new RangeError("Dead combat actor has no adventurer.");
      activities.push(deathSignal(hero,state.day,state.worldClock.tick));
    }
    if(combat.outcome==="fighting"){
      continuing.push({...fight,state:combat,frames});
      continue;
    }
    const replay=groupCombatReplayFromFrames(fight.encounter.options,combat,frames);
    const party=fight.heroIds.map(id=>{
      const hero=byId.get(id);
      if(!hero)throw new RangeError("Missing LIVE combat adventurer.");
      return hero;
    });
    const floor=fight.encounter.floor;
    const world=dungeonWorldAt(dungeonWorlds,floor);
    const settled=settleSpatialDungeonCombat(party,world,state.day,
      fight.encounter,combat,replay,fight.arrivals,state.seed);
    dungeonWorlds=setDungeonWorld(dungeonWorlds,floor,settled.world);
    fallenHeroes=recordFallenHeroes(fallenHeroes,settled,state.day);
    if(fight.heroIds.length>=2) {
      const survivors=settled.ticks.filter(t=>t.adventurer.health>0)
        .map(t=>t.adventurer.id);
      if(survivors.length>=2)sharedGroups.push(survivors);
    }
    // Fight settlement is another genuine strategic decision boundary.
    // Use the SAME party negotiation and post-fight readiness as map steps.
    const surviving=settled.ticks.filter(t=>t.adventurer.health>0&&
      t.adventurer.status==="exploring");
    const survivors=surviving.map(t=>t.adventurer);
    const bossAvailable=!state.dungeonFloors.some(f=>f.floor===10&&f.cleared);
    const bossReady=bossAvailable&&isBossExpeditionParty(survivors);
    const reasons=new Map<string,DungeonDecisionReason>();
    const independent=new Map(surviving.map(t=>{
      const h=t.adventurer;
      const progress=settled.world.heroes.find(p=>p.heroId===h.id);
      // A committed backtrack cannot be cancelled by winning a fight.
      const returning=returns.some(j=>j.heroId===h.id&&j.phase==="backtrack");
      const decision:HeroDungeonDecision=returning?{goal:"resupply",action:"shop"}:
        chooseLiveHeroDungeonDecision(h,progress,t.replay,
          undefined,undefined,bossReady,carriedDungeonFindCount(party.find(m=>m.id===h.id)!),
          diagnostic?reason=>{reasons.set(h.id,reason);}:undefined,plans.get(h.id),bossAvailable,
          party.find(m=>m.id===h.id)!.health,state.worldClock.tick);
      return [h.id,decision] as const;
    }));
    const agreed=negotiatePartyFloorDecisions(survivors,independent);
    for(const tick of settled.ticks){
      const id=tick.adventurer.id;
      byId.set(id,tick.adventurer);
      if(tick.adventurer.status==="dead"){
        returns=returns.filter(j=>j.heroId!==id);
        plans.delete(id);
      }else {
        const progress=settled.world.heroes.find(p=>p.heroId===id);
        const decision=agreed.get(id)!;
        diagnostic?.({stage:"combat-decision",day:state.day,tick:state.worldClock.tick,
          floor,heroId:id,memberIds:survivors.map(member=>member.id),
          checks:{bossReady,partySize:survivors.length>=2&&survivors.length<=3,
            ready:survivors.every(isBossExpeditionCandidate),
            armed:survivors.every(member=>member.equipment.weapon!==null),
            partyHealth:survivors.every(member=>member.health/heroProgression(member).maxHealth>=.60),
            visitedEnough:(progress?.visited.length??0)>=13,
            heroHealth:tick.adventurer.health/heroProgression(tick.adventurer).maxHealth>=.60,
            bossCandidate:isBossExpeditionCandidate(tick.adventurer),
            largerHaul:salvageReturnThreshold(tick.adventurer)>4,
            deferredFreshHaul:carriedDungeonFindCount(tick.adventurer)>=4&&
              carriedDungeonFindCount(tick.adventurer)<salvageReturnThreshold(tick.adventurer)&&
              carriedDungeonFindCount(tick.adventurer)>carriedDungeonFindCount(party.find(m=>m.id===id)!),
            partyChangedAction:decision.action!==independent.get(id)?.action},
          action:decision.action,goal:decision.goal,reason:reasons.get(id)});
        recordLivePlan(plans,tick.adventurer,decision,state.worldClock.tick);
        if(!returns.some(j=>j.heroId===id)&&decision.action==="shop")
          returns.push({heroId:id,fromFloor:floor,
            startedTick:state.worldClock.tick,phase:"backtrack"});
      }
      const moving=returns.some(j=>j.heroId===id&&j.phase==="backtrack")||
        plans.get(id)?.action==="ascend"||plans.get(id)?.action==="descend";
      counts.set(id,{heroId:id,steps:counts.get(id)?.steps??1,
        finished:tick.adventurer.health===0||
          (tick.replay.outcome!=="exploring"&&!moving)});
      activities.push({
        id:"day-"+state.day+":"+id+":dungeon-live:"+state.worldClock.tick,
        day:state.day,worldTick:state.worldClock.tick,type:"dungeon-live",
        adventurerId:id,reportedZone:zone(floor),
        dungeonReplay:tick.replay,
        ...(plans.get(id)?{dungeonGoal:plans.get(id)!.goal,
          floorAction:plans.get(id)!.action}:{}),
        message:tick.adventurer.name+"'s life-signature changed during an expedition. Details await a report.",
      });
    }
  }
  const roster=state.adventurers.map(h=>byId.get(h.id)!);
  const parties=settleLivePartyRelationships(state.dungeonParties??[],
    sharedGroups,roster,floor=>dungeonWorldAt(dungeonWorlds,floor),plans,state.seed,state.day,state.worldClock.tick);
  const active=continuing.length>0||!!partyBossContinuing;
  const next:GameState={...state,
    worldClock:clock,rngState,
    adventurers:roster,dungeonParties:parties.parties,
    fallenHeroes,dungeonWorlds,
    dungeonFloors:[
      ...state.dungeonFloors,
      ...(partyBossCleared&&!state.dungeonFloors.some(f=>f.floor===10&&f.cleared)
        ?[{floor:10,cleared:true}]:[]),
    ],
    liveDungeon:{...state.liveDungeon,combats:continuing,
      partyBossCombat:partyBossContinuing,
      returns,plans:[...plans.values()],
      combatTick:active?state.worldClock.tick:0,
      heroes:[...counts.values()]},
    events:[...state.events,...activities,...parties.events],
  };
  return active?scheduleLiveCombat(next):next;
}

/** One world timeline dispatches both real customer expiry and live dungeon.
 * Unknown events throw. No player/render/replay code invokes a second roll.
 */
export function commitLiveWorldEvent(
  state:GameState,event:ScheduledWorldEvent,diagnostic?:DungeonDiagnosticSink,
):GameState {
  if(event.lane==="visitor")return commitShopRequestEvent(state,event);
  if(event.lane==="report")return commitPortalReturn(state,event);
  if(event.lane!=="expedition"||!state.liveDungeon.enabled)
    throw new RangeError("Unexpected world event without an authoritative owner.");
  if(event.subjectId===LIVE_COMBAT_EVENT_SUBJECT)return commitLiveCombatTick(state,diagnostic);
  if(event.subjectId===DUNGEON_WORLD_EVENT_SUBJECT)return commitDungeonTick(state,diagnostic);
  throw new RangeError("Unknown expedition world event owner.");
}

/** Bedtime closes actual physical shop customers, but NEVER performs the
 * now-in-progress dungeon journey a second time. The same scheduler already
 * consumed the full prior day's queued movement and fight events.
 */
export function finishLiveDungeonDay(
  state:GameState,
):{state:GameState;events:readonly WorldEvent[]}{
  if(!state.liveDungeon.enabled)
    throw new RangeError("Cannot close an inactive live dungeon.");
  const fighting=new Set(state.liveDungeon.combats.flatMap(c=>c.heroIds));
  for(const id of state.liveDungeon.partyBossCombat?.heroIds??[])fighting.add(id);
  const day=state.day+1;
  const clock=beginNextWorldDay(state.worldClock,state.day);
  const closed=returnUnpaidCartsAtClose(state);
  const priorPaid=manuallyPaidVisitors(state.events,state.day);
  let rngState=new SeededRandom(state.rngState).state;
  const events:WorldEvent[]=[{
    id:`day-${day}:started`,type:"day-started",day,
    message:`Day ${day} begins.`,
  }];
  const adventurers=closed.adventurers.map(hero=>{
    // Resting heroes consume medicine at their scheduled return, not
    // again at midnight. Other heroes retain the existing daily first aid.
    if(fighting.has(hero.id)||hero.status==="off-duty")return hero;
    const healed=useHealingSupplies(hero,day);
    events.push(...healed.events);
    const ready=healed.adventurer;
    if(ready.status==="returning"&&typeof ready.floor==="number"&&
       ready.floor>=1&&ready.floor<=9)
      return {...ready,status:"exploring" as const};
    // Sleeping cannot complete a portal journey which is still scheduled
    // for a subsequent live world tick.
    if(ready.status==="traveling")return ready;
    // Readiness cannot silently teleport a visitor to a boss at dawn.
    // Every new journey begins only after the real door crossing + downtime.
    const shop=scheduleShopVisit(ready,day,rngState,
      priorPaid.has(hero.id),true);
    rngState=shop.rngState;
    events.push(...shop.events);
    return shop.adventurer;
  });
  const active=adventurers.filter(hero=>hero.status!=="dead").length;
  const influx=Math.min(state.populationConfig.dailyInflux,
    Math.max(0,state.populationConfig.maxActive-active));
  for(let i=0;i<influx;i++){
    const {adventurer,rngState:nextRng}=generateAdventurer(
      state.nextAdventurerId+i,rngState);
    rngState=nextRng;
    adventurers.push(adventurer);
    events.push({
      id:`day-${day}:${adventurer.id}:influx`,type:"influx",day,
      adventurerId:adventurer.id,
      message:`${adventurer.name} entered Floor 1.`,
    });
  }
  const next:GameState={
    ...closed,day,worldClock:clock,
    shopTraffic:{day,tick:clock.tick,initialized:false,actors:[],
      claims:[],shelfOwners:[],doorY:{portal:0}},
    shopEconomy:{...closed.shopEconomy,
      dailySales:{day,units:0,revenue:0}},
    adventurers,rngState,
    nextAdventurerId:state.nextAdventurerId+influx,
    liveDungeon:{enabled:true,lastStepTick:clock.tick,heroes:[],
      combatTick:state.liveDungeon.combatTick,combats:state.liveDungeon.combats,
      partyBossCombat:state.liveDungeon.partyBossCombat??null,
      returns:state.liveDungeon.returns,
      plans:state.liveDungeon.plans.filter(plan=>
        adventurers.some(h=>h.id===plan.heroId&&h.floor===plan.floor&&
          h.health>0&&h.status==="exploring"))},
    events:[...state.events,...events],
  };
  const finalPlans=new Map(next.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const party=settleLivePartyRelationships(state.dungeonParties??[],
    state.liveDungeon.combats.filter(c=>c.heroIds.length>=2).map(c=>c.heroIds),
    adventurers,floor=>dungeonWorldAt(next.dungeonWorlds,floor),finalPlans,state.seed,day,clock.tick);
  const committed={...next,dungeonParties:party.parties,
    events:compactReplayFootage([...next.events,...party.events],
      day,state.savedReplayIds)};
  // A pending combat burst can be due exactly at dawn. Commit it on the
  // new day through the existing queue, never drop it or duplicate a step.
  // All surviving combatants retain their pre-fight roster HP and resources
  // until the normal settlement; midnight is not a free heal.
  const dawn=advanceWorldUntil(queueNextDungeonWorldTick(committed),clock.tick,
    commitLiveWorldEvent);
  return {state:dawn,events:dawn.events.filter(e=>e.day===day)};
}
