import type {GameState,WorldEvent,EarlyDungeonFloorWorld} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import {generateAdventurer,useHealingSupplies} from "./adventurers.ts";
import {generateExpeditionLayout,dungeonDownStair,type DungeonPoint} from "./dungeonLayout.ts";
import {chooseHeroDungeonDecision,chooseLiveHeroDungeonDecision,
  type HeroDungeonDecision} from "./dungeonDecisions.ts";
import {choosePersistentDungeonParty,negotiatePartyFloorDecisions,
  settlePersistentDungeonParties,temporaryPartyChanges,
  type DungeonPartyState} from "./dungeonParties.ts";
import {advanceSpatialDungeonPartyStep,emptyLevel7World,settleSpatialDungeonCombat,
  LEVEL7_COMBAT_SECONDS,getLevel7Progress,type PreparedSpatialEncounter,type Level7Replay,
  type SpatialDungeonFloor,type Level7World} from "./level7Exploration.ts";
import {createGroupCombat,stepGroupCombat,captureGroupCombatFrame,
  groupCombatReplayFromFrames,type GroupCombatState,
  type GroupReplayFrame} from "./groupCombat.ts";
import {simulateLevel6Combat} from "./level6Combat.ts";
import {returnUnpaidCartsAtClose} from "./shopCarts.ts";
import {scheduleShopVisit} from "./shopArrivals.ts";
import {commitShopRequestEvent} from "./shopRuntime.ts";
import {SeededRandom} from "./random.ts";
import {beginNextWorldDay,firstWorldTickOfDay,lastWorldTickOfDay,
  scheduleWorldEvent,type ScheduledWorldEvent} from "./worldClock.ts";

/** Gameplay tuning; this is not the legacy 36-steps-per-day solver.
 * One event = at most ONE spatial tile for each live party. At the current
 * pacing the cadence is 30 unpaused real seconds; bed fast-forwards
 * remaining actual event ticks exactly once.
 */
export const DUNGEON_STEP_INTERVAL_TICKS=600;
export const DUNGEON_WORLD_EVENT_SUBJECT="dungeon-world";
export const LIVE_COMBAT_EVENT_SUBJECT="dungeon-combat";
/** Each clock event executes thirty genuine 60Hz fighter ticks in 0.5s. */
export const LIVE_COMBAT_INTERVAL_TICKS=10;
export const SHOP_PORTAL_RETURN_PREFIX="shop-return:";
/** The actual portal crossing takes one more game minute after backtracking. */
export const SHOP_PORTAL_TRANSIT_TICKS=20;

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
  readonly arrivals:readonly Level7Replay[];
  readonly state:GroupCombatState;
  readonly frames:readonly GroupReplayFrame[];
}
export interface LiveDungeonReturn {
  readonly heroId:string;
  readonly fromFloor:1|2|3|4|6|7;
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
}
export interface LiveDungeonState {
  readonly enabled:boolean;
  readonly lastStepTick:number;
  readonly heroes:readonly LiveDungeonHeroStep[];
  readonly combatTick:number;
  readonly combats:readonly LiveDungeonCombat[];
  readonly returns:readonly LiveDungeonReturn[];
  /** Durable individual intentions, never player-issued party orders. */
  readonly plans:readonly LiveDungeonPlan[];
}
export const createLiveDungeonState=():LiveDungeonState=>({
  enabled:false,lastStepTick:0,heroes:[],combatTick:0,combats:[],
  returns:[],plans:[],
});

const eligible=(hero:AdventurerState)=>
  hero.health>0&&(
    hero.status==="exploring"&&hero.floor>=1&&hero.floor<=4||
    hero.status==="expedition"&&hero.floor===7||
    hero.status==="expedition"&&hero.floor===6
  );
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
  if(!state.liveDungeon.combats.length)return state;
  if(state.worldClock.pending.some(e=>e.lane==="expedition"&&
    e.subjectId===LIVE_COMBAT_EVENT_SUBJECT))
    throw new RangeError("Duplicate live combat clock event.");
  return {...state,worldClock:scheduleWorldEvent(state.worldClock,
    "expedition",state.worldClock.tick+LIVE_COMBAT_INTERVAL_TICKS,
    LIVE_COMBAT_EVENT_SUBJECT)};
}

function spatialWorld(state:GameState,floor:SpatialDungeonFloor):Level7World{
  return floor===7?state.level7World:
    state.earlyDungeonWorlds?.find(entry=>entry.floor===floor)?.world??
    emptyLevel7World();
}
/** A decision is based on real committed HP, gear, loot and visited
 * rooms, not a daily dice roll or a report/replay viewer.
 */
function wantsToReturn(
  hero:AdventurerState,world:Level7World,replay:Level7Replay,
  seed:number,
):boolean {
  if(hero.health<=0)return false;
  if(hero.floor===7)
    return replay.outcome==="retreat"||replay.outcome==="completed";
  if(hero.floor<1||hero.floor>4||hero.status!=="exploring")return false;
  const progress=getLevel7Progress(world,hero.id,
    generateExpeditionLayout(seed,hero.floor));
  return chooseHeroDungeonDecision(hero,progress,replay).action==="shop";
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
    hero:{...hero,status:"traveling",floor:4,shopStayDays:0},
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
     !hero||hero.status!=="traveling"||hero.floor!==4)
    throw new RangeError("Portal arrival lacks a committed physical return.");
  // Multiple genuine visits in a day are legal. The identity is tied
  // to the ONE consumed portal crossing, not to a lossy per-day hero flag.
  // Paid goods remain protected by the existing once-per-day sale ledger.
  const arrival:WorldEvent={
    id:"day-"+state.day+":"+id+":shop-arrival:"+state.worldClock.tick,
    type:"shop-arrival",day:state.day,worldTick:state.worldClock.tick,
    adventurerId:id,
    message:hero.name+" emerged through Galvik's portal into the shop.",
  };
  return {...state,adventurers:state.adventurers.map(h=>h.id===id?
      {...h,status:"at-shop" as const,floor:5 as const,shopStayDays:0}:h),
    liveDungeon:{...state.liveDungeon,
      returns:state.liveDungeon.returns.filter(j=>j.heroId!==id)},
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
  roster:readonly AdventurerState[],worldForFloor:(floor:SpatialDungeonFloor)=>Level7World,
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

function commitDungeonTick(state:GameState):GameState {
  const tick=state.worldClock.tick;
  const day=state.day;
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const processed=new Set(state.liveDungeon.combats.flatMap(c=>c.heroIds));
  const combatSites=new Set(state.liveDungeon.combats.map(c=>
    c.encounter.floor+":"+c.encounter.featureId));
  const combats=[...state.liveDungeon.combats];
  let returns=[...state.liveDungeon.returns];
  let clock=state.worldClock;
  const plans=new Map(state.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const sharedGroups:string[][]=state.liveDungeon.combats
    .filter(c=>c.heroIds.length>=2).map(c=>[...c.heroIds]);
  const stepCounts=new Map(state.liveDungeon.heroes.map(v=>[v.heroId,v]));
  let level7World=state.level7World;
  let earlyDungeonWorlds:EarlyDungeonFloorWorld[]=[...(state.earlyDungeonWorlds??[])];
  let clearedLevel6=state.dungeonFloors.some(f=>f.floor===6&&f.cleared);
  let clearedLevel7=state.dungeonFloors.some(f=>f.floor===7&&f.cleared);
  let rngState=state.rngState;
  const activities:WorldEvent[]=[];
  // Use roster order for stable, saved simultaneous encounter arbitration.
  // Shared sites are updated before the next party can inspect that tile.
  for(const original of state.adventurers){
    const hero=byId.get(original.id)!;
    if(!eligible(hero)||processed.has(hero.id)||
       stepCounts.get(hero.id)?.finished)continue;
    if(hero.floor===6){
      // The existing unique boss resolver is reused, and never run again at
      // bed. A future milestone must time its 60 Hz frames individually.
      const fight=simulateLevel6Combat(hero,day,rngState);
      rngState=fight.rngState;
      byId.set(hero.id,fight.adventurer);
      if(fight.adventurer.status==="traveling"){
        // The unique Troll battle is still an atomic cinematic fight. Its
        // already-settled survivor nevertheless returns through a genuine
        // scheduled portal instead of a midnight shop teleport.
        const journey=beginPortalReturn({...fight.adventurer,
          status:"expedition",floor:6},tick,clock,returns);
        byId.set(hero.id,journey.hero);
        clock=journey.clock;returns=journey.returns;
      }
      processed.add(hero.id);
      stepCounts.set(hero.id,{heroId:hero.id,steps:1,finished:true});
      activities.push(...fight.events);
      if(fight.victory)clearedLevel6=true;
      continue;
    }
    const floor=hero.floor as SpatialDungeonFloor;
    const world=floor===7?level7World:
      earlyDungeonWorlds.find(entry=>entry.floor===floor)?.world??
      emptyLevel7World();
    const roster=state.adventurers.map(h=>byId.get(h.id)!);
    const layout=generateExpeditionLayout(state.seed,floor);
    const homeward=returns.find(j=>j.heroId===hero.id&&
      j.phase==="backtrack");
    const priorPlan=plans.get(hero.id);
    if(!homeward&&priorPlan?.floor===floor&&
      (priorPlan.action==="ascend"||priorPlan.action==="descend")&&
      ((priorPlan.action==="ascend"&&floor>1&&floor<=4)||
       (priorPlan.action==="descend"&&floor<4))){
      const target=actualStair(state.seed,floor,priorPlan.action);
      const at=getLevel7Progress(world,hero.id,layout);
      if(at.x===target.x&&at.z===target.z){
        // A staircase consumes this scheduled movement event; it may be
        // crossed only from the real saved tile. Co-located companions
        // who consented to the same direction cross TOGETHER.
        const nextFloor=(floor+(priorPlan.action==="ascend"?-1:1))
          as EarlyDungeonFloorWorld["floor"];
        const priorParty=(state.dungeonParties??[]).find(p=>
          p.floor===floor&&p.memberIds.includes(hero.id));
        const participants=priorParty?.memberIds.map(id=>byId.get(id)!)
          .filter(Boolean)??[hero];
        const crossing=participants.length>1&&participants.every(member=>{
          const plan=plans.get(member.id);
          const pos=getLevel7Progress(world,member.id,layout);
          return !processed.has(member.id)&&eligible(member)&&
            member.floor===floor&&plan?.action===priorPlan.action&&
            pos.x===target.x&&pos.z===target.z&&
            !returns.some(r=>r.heroId===member.id);
        })?participants:[hero];
        const destinationLayout=generateExpeditionLayout(state.seed,nextFloor);
        const arrival=priorPlan.action==="ascend"
          ?dungeonDownStair(destinationLayout):destinationLayout.entrance;
        const previousWorld=earlyDungeonWorlds.find(e=>e.floor===nextFloor)?.world
          ??emptyLevel7World();
        const nextHeroes=[...previousWorld.heroes];
        for(const member of crossing){
          const old=nextHeroes.find(p=>p.heroId===member.id);
          const cell=arrival.z*destinationLayout.width+arrival.x;
          nextHeroes.splice(nextHeroes.findIndex(p=>p.heroId===member.id),0,
            ...(old?[{...old,...arrival,
              visited:old.visited.includes(cell)?old.visited:[...old.visited,cell]}]:
              [{heroId:member.id,...arrival,visited:[cell]}]));
          byId.set(member.id,{...member,floor:nextFloor});
          plans.delete(member.id);
          processed.add(member.id);
          stepCounts.set(member.id,{heroId:member.id,
            steps:(stepCounts.get(member.id)?.steps??0)+1,finished:false});
          activities.push({
            id:"day-"+day+":"+member.id+":dungeon-live:"+tick,
            type:"dungeon-live",day,worldTick:tick,adventurerId:member.id,
            dungeonGoal:priorPlan.goal,floorAction:priorPlan.action,
            message:member.name+"'s expedition changed depth. Details await a report.",
          });
        }
        earlyDungeonWorlds=[
          ...earlyDungeonWorlds.filter(e=>e.floor!==nextFloor),
          {floor:nextFloor,world:{...previousWorld,heroes:nextHeroes}},
        ].sort((a,b)=>a.floor-b.floor);
        if(crossing.length>=2)sharedGroups.push(crossing.map(h=>h.id));
        continue;
      }
    }
    if(homeward){
      const current=getLevel7Progress(world,hero.id,layout);
      if(current.x===layout.entrance.x&&current.z===layout.entrance.z){
        const journey=beginPortalReturn(hero,tick,clock,returns);
        byId.set(hero.id,journey.hero);
        clock=journey.clock;returns=journey.returns;
        processed.add(hero.id);
        stepCounts.set(hero.id,{heroId:hero.id,
          steps:(stepCounts.get(hero.id)?.steps??0)+1,finished:true});
        continue;
      }
    }
    const returningIds=new Set(returns.map(j=>j.heroId));
    const group=homeward?[hero]:choosePersistentDungeonParty(hero,roster,world,layout,
      processed,state.dungeonParties??[]).filter(member=>
        !returningIds.has(member.id));
    const readyGroup=group.filter(member=>!stepCounts.get(member.id)?.finished);
    if(!readyGroup.length)continue;
    const occupied=new Set(roster.filter(member=>
      member.floor===floor&&eligible(member)).map(member=>member.id));
    const blocked=new Set([...combatSites].filter(key=>
      key.startsWith(floor+":")).map(key=>key.slice((floor+":").length)));
    const directed=priorPlan?.floor===floor&&
      (priorPlan.action==="ascend"||priorPlan.action==="descend")&&
      ((priorPlan.action==="ascend"&&floor>1&&floor<=4)||
       (priorPlan.action==="descend"&&floor<4))
      ?actualStair(state.seed,floor,priorPlan.action):undefined;
    const result=advanceSpatialDungeonPartyStep(readyGroup,world,state.seed,day,occupied,
      {deferCombat:true,deferReturn:true,returnToEntrance:!!homeward,
        ...(directed?{routeToKnownTarget:directed}:{}),
        blockedCombatSites:blocked});
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
    if(floor===7)level7World=result.world;
    else earlyDungeonWorlds=[
      ...earlyDungeonWorlds.filter(entry=>entry.floor!==floor),
      {floor:floor as EarlyDungeonFloorWorld["floor"],world:result.world},
    ].sort((a,b)=>a.floor-b.floor);
    for(const individual of result.ticks){
      const id=individual.adventurer.id;
      const count=(stepCounts.get(id)?.steps??0)+1;
      processed.add(id);
      byId.set(id,individual.adventurer);
      if(individual.adventurer.status==="dead")
        returns=returns.filter(j=>j.heroId!==id);
      else if(!result.pendingCombat){
        const progress=result.world.heroes.find(p=>p.heroId===id);
        const existing=returns.find(j=>j.heroId===id&&j.phase==="backtrack");
        if(!existing&&wantsToReturn(individual.adventurer,result.world,
          individual.replay,state.seed))
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
      const important=individual.replay.steps.some(s=>
        s.action==="treasure"||s.action==="trap"||
        s.action==="combat"||s.action==="death");
      const committedHero=byId.get(id)!;
      const stopped=individual.replay.outcome!=="exploring"||
        committedHero.status==="dead"||committedHero.status==="traveling";
      stepCounts.set(id,{heroId:id,steps:count,finished:stopped});
      if(individual.replay.outcome==="completed"&&floor===7)
        clearedLevel7=true;
      if(important||stopped){
        // The merchant knows that the magic life-signature changed, but not
        // details of unseen loot or battles. Actual facts remain in the
        // saved dungeon world, never in an invented shop report.
        activities.push({
          id:`day-${day}:${id}:dungeon-live:${tick}`,
          type:"dungeon-live",day,worldTick:tick,adventurerId:id,
          message:`${individual.adventurer.name}'s expedition changed. Details await a report.`,
        });
      }
    }
  }
  const next:GameState={
    ...state,worldClock:clock,
    adventurers:state.adventurers.map(hero=>byId.get(hero.id)!),
    earlyDungeonWorlds,level7World,
    rngState,
    dungeonFloors:[
      ...state.dungeonFloors,
      ...(clearedLevel6&&!state.dungeonFloors.some(x=>x.floor===6&&x.cleared)
        ?[{floor:6,cleared:true}]:[]),
      ...(clearedLevel7&&!state.dungeonFloors.some(x=>x.floor===7&&x.cleared)
        ?[{floor:7,cleared:true}]:[]),
    ],
    liveDungeon:{enabled:true,lastStepTick:tick,
      heroes:[...stepCounts.values()],
      combatTick:combats.length?state.liveDungeon.combatTick||tick:0,
      combats,returns},
    events:[...state.events,...activities],
  };
  const scheduled=queueNextDungeonWorldTick(next);
  return state.liveDungeon.combats.length||!combats.length?scheduled:
    scheduleLiveCombat(scheduled);
}

/** Run the existing 60Hz group engine on the saved world timeline.
 * Every scheduled 0.5s event advances exactly 30 ticks, or fewer if
 * the fight ends. Read-only replays NEVER call this function.
 */
function commitLiveCombatTick(state:GameState):GameState{
  if(!state.liveDungeon.combats.length||
     state.worldClock.tick!==state.liveDungeon.combatTick+LIVE_COMBAT_INTERVAL_TICKS)
    throw new RangeError("Unscheduled live battle advance.");
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const counts=new Map(state.liveDungeon.heroes.map(h=>[h.heroId,h]));
  let level7World=state.level7World;
  let earlyDungeonWorlds=[...(state.earlyDungeonWorlds??[])];
  const activities:WorldEvent[]=[];
  const continuing:LiveDungeonCombat[]=[];
  let returns=[...state.liveDungeon.returns];
  for(const fight of state.liveDungeon.combats){
    // Copy the authoritative mutable actors before stepping, preserving the
    // previous immutable checkpoint for deterministic save comparisons.
    const combat:GroupCombatState=structuredClone(fight.state);
    const frames=[...fight.frames];
    for(let i=0;i<LIVE_COMBAT_INTERVAL_TICKS*3&&combat.outcome==="fighting";i++){
      const step=Math.round(combat.time*60)+1;
      if(step>LEVEL7_COMBAT_SECONDS*60){combat.outcome="draw";break;}
      stepGroupCombat(combat);
      if(combat.outcome==="fighting"&&step===LEVEL7_COMBAT_SECONDS*60)
        combat.outcome="draw";
      if(step%6===0||combat.outcome!=="fighting")
        frames.push(captureGroupCombatFrame(combat));
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
    const world=floor===7?level7World:earlyDungeonWorlds.find(e=>
      e.floor===floor)?.world??emptyLevel7World();
    const settled=settleSpatialDungeonCombat(party,world,state.day,
      fight.encounter,combat,replay,fight.arrivals);
    if(floor===7)level7World=settled.world;
    else earlyDungeonWorlds=[
      ...earlyDungeonWorlds.filter(entry=>entry.floor!==floor),
      {floor:floor as EarlyDungeonFloorWorld["floor"],world:settled.world},
    ].sort((a,b)=>a.floor-b.floor);
    for(const tick of settled.ticks){
      const id=tick.adventurer.id;
      byId.set(id,tick.adventurer);
      if(tick.adventurer.status==="dead")
        returns=returns.filter(j=>j.heroId!==id);
      else if(!returns.some(j=>j.heroId===id)&&
        wantsToReturn(tick.adventurer,settled.world,tick.replay,state.seed))
        returns.push({heroId:id,fromFloor:floor,
          startedTick:state.worldClock.tick,phase:"backtrack"});
      counts.set(id,{heroId:id,steps:counts.get(id)?.steps??1,
        finished:tick.replay.outcome!=="exploring"});
      activities.push({
        id:"day-"+state.day+":"+id+":dungeon-live:"+state.worldClock.tick,
        day:state.day,worldTick:state.worldClock.tick,type:"dungeon-live",
        adventurerId:id,
        ...(floor===7?{level7Replay:tick.replay}:{dungeonReplay:tick.replay}),
        message:tick.adventurer.name+"'s life-signature changed during an expedition. Details await a report.",
      });
    }
  }
  const next:GameState={...state,
    adventurers:state.adventurers.map(h=>byId.get(h.id)!),
    earlyDungeonWorlds,level7World,
    liveDungeon:{...state.liveDungeon,combats:continuing,returns,
      combatTick:continuing.length?state.worldClock.tick:0,
      heroes:[...counts.values()]},
    events:[...state.events,...activities],
  };
  return continuing.length?scheduleLiveCombat(next):next;
}

/** One world timeline dispatches both real customer expiry and live dungeon.
 * Unknown events throw. No player/render/replay code invokes a second roll.
 */
export function commitLiveWorldEvent(
  state:GameState,event:ScheduledWorldEvent,
):GameState {
  if(event.lane==="visitor")return commitShopRequestEvent(state,event);
  if(event.lane==="report")return commitPortalReturn(state,event);
  if(event.lane!=="expedition"||!state.liveDungeon.enabled)
    throw new RangeError("Unexpected world event without an authoritative owner.");
  if(event.subjectId===LIVE_COMBAT_EVENT_SUBJECT)return commitLiveCombatTick(state);
  if(event.subjectId===DUNGEON_WORLD_EVENT_SUBJECT)return commitDungeonTick(state);
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
  if(state.liveDungeon.combats.length)
    throw new RangeError("Cannot close a day while a real fight is unresolved.");
  const day=state.day+1;
  const clock=beginNextWorldDay(state.worldClock,state.day);
  const closed=returnUnpaidCartsAtClose(state);
  const priorPaid=new Set(state.events.filter(e=>e.day===state.day&&
    e.type==="sale"&&e.saleChannel==="manual")
    .map(e=>e.adventurerId));
  let rngState=new SeededRandom(state.rngState).state;
  const events:WorldEvent[]=[{
    id:`day-${day}:started`,type:"day-started",day,
    message:`Day ${day} begins.`,
  }];
  const previouslyCleared6=state.dungeonFloors.some(f=>f.floor===6&&f.cleared);
  const previouslyCleared7=state.dungeonFloors.some(f=>f.floor===7&&f.cleared);
  const adventurers=closed.adventurers.map(hero=>{
    const healed=useHealingSupplies(hero,day);
    events.push(...healed.events);
    const ready=healed.adventurer;
    if(ready.status==="returning"&&ready.floor>=1&&ready.floor<=4)
      return {...ready,status:"exploring" as const};
    // Sleeping cannot complete a portal journey which is still scheduled
    // for a subsequent live world tick.
    if(ready.status==="traveling")return ready;
    if(ready.status==="at-shop"&&ready.level6Permit&&ready.health>0&&
       !previouslyCleared7){
      const target=previouslyCleared6?7 as const:6 as const;
      const type=target===7?"level7-departure" as const:
        "level6-departure" as const;
      events.push({
        id:`day-${day}:${ready.id}:${type}`,type,day,
        adventurerId:ready.id,
        message:`${ready.name} left Galvik's shop for Floor ${target}.`,
      });
      return {...ready,status:"expedition" as const,
        floor:target,shopStayDays:0};
    }
    const shop=scheduleShopVisit(ready,day,rngState,
      priorPaid.has(hero.id));
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
      claims:[],shelfOwners:[],doorY:{level4:0,level6:0}},
    shopEconomy:{...closed.shopEconomy,
      dailySales:{day,units:0,revenue:0}},
    adventurers,rngState,
    nextAdventurerId:state.nextAdventurerId+influx,
    liveDungeon:{enabled:true,lastStepTick:clock.tick,heroes:[],
      combatTick:0,combats:[],returns:state.liveDungeon.returns},
    events:[...state.events,...events],
  };
  return {state:queueNextDungeonWorldTick(next),events};
}
