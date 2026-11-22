import type {GameState,WorldEvent,EarlyDungeonFloorWorld} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import {generateAdventurer,useHealingSupplies} from "./adventurers.ts";
import {heroProgression,settleHeroExperience} from "./heroProgression.ts";
import {generateExpeditionLayout,dungeonDownStair,type DungeonPoint} from "./dungeonLayout.ts";
import {chooseLiveHeroDungeonDecision,selectKnownResourceSite,
  type HeroDungeonDecision} from "./dungeonDecisions.ts";
import {choosePersistentDungeonParty,negotiatePartyFloorDecisions,
  settlePersistentDungeonParties,temporaryPartyChanges,
  type DungeonPartyState} from "./dungeonParties.ts";
import {advanceSpatialDungeonPartyStep,emptyLevel7World,settleSpatialDungeonCombat,
  LEVEL7_COMBAT_SECONDS,getLevel7Progress,type PreparedSpatialEncounter,type Level7Replay,
  type SpatialDungeonFloor,type Level7World} from "./level7Exploration.ts";
import {createGroupCombat,stepGroupCombat,captureGroupCombatFrame,
  groupCombatReplayFromFrames,type GroupCombatState,
  type GroupReplayFrame,type GroupCombatOptions} from "./groupCombat.ts";
import {
  type ArenaCue,
} from "./arenaCombatMotion.ts";
import {
  createSharedBossPreview,stepSharedBossPreview,
  caveTrollPartyOptions,type SharedBossPreview,
} from "./sharedBossCombat.ts";
import {canAttemptCaveTroll,CAVE_TROLL_FLOOR} from "./dungeonTopology.ts";
import {
  frameFromCombat,REPLAY_MAX_SECONDS,
  type BossReplayFrame,type BossCombatReplay,
} from "./bossCombatReplay.ts";
import {returnUnpaidCartsAtClose} from "./shopCarts.ts";
import {scheduleShopVisit} from "./shopArrivals.ts";
import {commitShopRequestEvent} from "./shopRuntime.ts";
import {SeededRandom} from "./random.ts";
import {compactReplayFootage} from "./replayRetention.ts";
import {beginNextWorldDay,firstWorldTickOfDay,lastWorldTickOfDay,
  scheduleWorldEvent,type ScheduledWorldEvent} from "./worldClock.ts";

/** Gameplay tuning; this is not the legacy 36-steps-per-day solver.
 * One event = at most ONE spatial tile for each live party. At the current
 * pacing the cadence is now 10 unpaused real seconds; bed fast-forwards
 * remaining actual event ticks exactly once.
 */
export const DUNGEON_STEP_INTERVAL_TICKS=200;
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
export interface LiveBossCombat {
  readonly id:string;
  readonly startedTick:number;
  readonly heroId:string;
  /** Original solo Cave Troll state, stepped by the SAME 60Hz encounter driver. */
  readonly state:SharedBossPreview;
  /** Saved real poses. The 8-frame sampling contract remains BossReplay v1. */
  readonly frames:readonly BossReplayFrame[];
  /** Cues accumulated between snapshot boundaries, never replayed as AI. */
  readonly pendingCues:readonly ArenaCue[];
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
}
export interface LiveDungeonState {
  readonly enabled:boolean;
  readonly lastStepTick:number;
  readonly heroes:readonly LiveDungeonHeroStep[];
  readonly combatTick:number;
  readonly combats:readonly LiveDungeonCombat[];
  /** Optional so existing active saves are not forcibly rewritten. */
  readonly bossCombat?:LiveBossCombat|null;
  /** Optional to read unchanged pre-Level-10 campaigns. */
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
  hero.health>0&&(
    hero.status==="exploring"&&hero.floor>=1&&hero.floor<=9||
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
  if(!state.liveDungeon.combats.length&&!state.liveDungeon.bossCombat&&
     !state.liveDungeon.partyBossCombat)return state;
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
      {...h,status:"at-shop" as const,floor:5 as const,shopStayDays:0,
        // The abstract chest counter is a trip-haul threshold, not a
        // sellable item. Unload it upon reaching Galvik; retain the real
        // owned finds and all actual gold/equipment for manual buyback.
        inventory:{...h.inventory,loot:0}}:h),
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

function commitDungeonTick(state:GameState):GameState {
  const tick=state.worldClock.tick;
  const day=state.day;
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const processed=new Set(state.liveDungeon.combats.flatMap(c=>c.heroIds));
  for(const id of state.liveDungeon.partyBossCombat?.heroIds??[])processed.add(id);
  if(state.liveDungeon.bossCombat)
    processed.add(state.liveDungeon.bossCombat.heroId);
  let bossCombat=state.liveDungeon.bossCombat??null;
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
  let level7World=state.level7World;
  let earlyDungeonWorlds:EarlyDungeonFloorWorld[]=[...(state.earlyDungeonWorlds??[])];
  let clearedLevel6=state.dungeonFloors.some(f=>f.floor===6&&f.cleared);
  let clearedLevel7=state.dungeonFloors.some(f=>f.floor===7&&f.cleared);
  const clearedLevel10=state.dungeonFloors.some(f=>
    f.floor===CAVE_TROLL_FLOOR&&f.cleared);
  let rngState=state.rngState;
  const activities:WorldEvent[]=[];
  // Use roster order for stable, saved simultaneous encounter arbitration.
  // Shared sites are updated before the next party can inspect that tile.
  for(const original of state.adventurers){
    const hero=byId.get(original.id)!;
    if(!eligible(hero)||processed.has(hero.id)||
       stepCounts.get(hero.id)?.finished)continue;
    if(hero.floor===6&&hero.status==="expedition"){
      // The unique boss now starts a real *saved* 60Hz fight on the shared
      // world clock. Never resolve a hidden 90-second fight in this step.
      // A second arrival cannot instantiate a clone of the same Troll.
      if(bossCombat){
        processed.add(hero.id);
        continue;
      }
      if(clearedLevel6){
        const journey=beginPortalReturn(hero,tick,clock,returns);
        byId.set(hero.id,journey.hero);
        clock=journey.clock;returns=journey.returns;
        processed.add(hero.id);
        stepCounts.set(hero.id,{heroId:hero.id,steps:1,finished:true});
        continue;
      }
      // A 90-second authentic boss duel needs enough world-clock room.
      // Late-night starts otherwise trap the player in an unfinished fight
      // at the hard bedtime boundary. Defer the start, never truncate it.
      if(tick+REPLAY_MAX_SECONDS*20+SHOP_PORTAL_TRANSIT_TICKS>
          lastWorldTickOfDay(day)){
        processed.add(hero.id);
        stepCounts.set(hero.id,{heroId:hero.id,steps:1,finished:true});
        activities.push({
          id:"day-"+day+":"+hero.id+":dungeon-live:"+tick,
          type:"dungeon-live",day,worldTick:tick,adventurerId:hero.id,
          reportedZone:"deep",
          message:hero.name+" is waiting out the last hours of the expedition day.",
        });
        continue;
      }
      const rng=new SeededRandom(rngState);
      const tacticsSeed=rng.int(32);
      rngState=rng.state;
      const progress=heroProgression(hero);
      const motion=createSharedBossPreview({
        role:hero.role,sword:hero.equipment.weapon==="Iron Sword",
        armor:hero.equipment.armor==="Leather Vest",
        health:hero.health,maxHealth:progress.maxHealth,
        healingSupplies:hero.inventory.healing,
        strength:progress.strength,agility:progress.agility,
        intellect:progress.intellect,
        progressionDamageBonus:progress.damageBonus,
        progressionArmorBonus:progress.armorBonus,
        progressionMagicHeals:progress.bonusMagicHeals,tacticsSeed,
      });
      bossCombat={
        id:"live-boss:"+day+":"+tick+":"+hero.id,
        startedTick:tick,heroId:hero.id,state:motion,
        frames:[frameFromCombat(motion)],pendingCues:[],
      };
      processed.add(hero.id);
      stepCounts.set(hero.id,{heroId:hero.id,steps:1,finished:true});
      activities.push({
        id:"day-"+day+":"+hero.id+":dungeon-live:"+tick,
        type:"dungeon-live",day,worldTick:tick,adventurerId:hero.id,
        reportedZone:"deep",
        message:hero.name+" entered a dangerous chamber. Their life-signature is still active.",
      });
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
      ((priorPlan.action==="ascend"&&floor>1&&floor<=9)||
       (priorPlan.action==="descend"&&floor<10))){
      const target=actualStair(state.seed,floor,priorPlan.action);
      const at=getLevel7Progress(world,hero.id,layout);
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
          const pos=getLevel7Progress(world,member.id,layout);
          return !processed.has(member.id)&&eligible(member)&&
            member.floor===floor&&plan?.action===priorPlan.action&&
            pos.x===target.x&&pos.z===target.z&&
            !returns.some(r=>r.heroId===member.id);
        })?participants:[hero];
        if(floor===9&&priorPlan.action==="descend"){
          // A genuine saved temporary party physically reaches Floor 9's
          // lower stair together. No solo permit can spawn a fake team.
          const partyValid=!!priorParty&&
            crossing.length===priorParty.memberIds.length&&
            canAttemptCaveTroll(crossing.length,
              crossing.every(member=>member.level6Permit))&&
            crossing.every(member=>member.health>0)&&
            !partyBossCombat&&!clearedLevel10;
          const hasTime=tick+REPLAY_MAX_SECONDS*20+
            SHOP_PORTAL_TRANSIT_TICKS<=lastWorldTickOfDay(day);
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
        const destinationLayout=generateExpeditionLayout(state.seed,nextFloor);
        const arrival=priorPlan.action==="ascend"
          ?dungeonDownStair(destinationLayout):destinationLayout.entrance;
        const previousWorld=nextFloor===7?level7World:
          earlyDungeonWorlds.find(e=>e.floor===nextFloor)?.world??
          emptyLevel7World();
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
          byId.set(member.id,{...member,floor:nextFloor});
          plans.delete(member.id);
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
        if(nextFloor===7)level7World={...previousWorld,heroes:nextHeroes};
        else earlyDungeonWorlds=[
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
        plans.delete(hero.id);
        processed.add(hero.id);
        stepCounts.set(hero.id,{heroId:hero.id,
          steps:(stepCounts.get(hero.id)?.steps??0)+1,finished:true});
        continue;
      }
    }
    // A full ordinary fight can now legitimately consume its entire 25s
    // budget (especially when veteran healers take part). The shopkeeper
    // must never be unable to close the day because a newly started
    // encounter still owns the 60Hz clock after midnight. Defer optional
    // map steps until next morning; portal/stair crossings above still work.
    if(tick+LEVEL7_COMBAT_SECONDS*20+LIVE_COMBAT_INTERVAL_TICKS>
       lastWorldTickOfDay(day)){
      processed.add(hero.id);
      stepCounts.set(hero.id,{heroId:hero.id,
        steps:(stepCounts.get(hero.id)?.steps??0)+1,finished:true});
      continue;
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
      ((priorPlan.action==="ascend"&&floor>1&&floor<=9)||
       (priorPlan.action==="descend"&&floor<10))
      ?actualStair(state.seed,floor,priorPlan.action):undefined;
    // A saved autonomous loot/hunt intention may redirect a step only to a
    // personally known, still-active chest/monster site. Never let the
    // omniscient spectator map plan hero movement.
    const known=getLevel7Progress(world,hero.id,layout);
    const resourceKind=priorPlan?.floor===floor?
      priorPlan.goal==="loot-chest"?"treasure":
      priorPlan.goal==="hunt-ghouls"?"monster":null:null;
    const candidate=resourceKind&&!homeward&&!directed
      ?selectKnownResourceSite(layout,known,world,resourceKind):null;
    const resourceTarget=candidate&&!blocked.has(candidate.id)?candidate:null;
    const result=advanceSpatialDungeonPartyStep(readyGroup,world,state.seed,day,occupied,
      {deferCombat:true,deferReturn:true,returnToEntrance:!!homeward,
        ...(directed?{routeToKnownTarget:directed}:{}),
        ...(resourceTarget?{routeToResource:resourceTarget}:{}),
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
    const independent=new Map<string,HeroDungeonDecision>();
    if(!result.pendingCombat)for(const individual of result.ticks){
      if(individual.adventurer.health<=0)continue;
      const progress=result.world.heroes.find(p=>
        p.heroId===individual.adventurer.id);
      const bossReady=floor===9&&
        canAttemptCaveTroll(readyGroup.length,
          readyGroup.every(member=>member.level6Permit))&&
        readyGroup.every(member=>member.equipment.weapon!==null&&
          member.health/heroProgression(member).maxHealth>=0.60);
      independent.set(individual.adventurer.id,
        chooseLiveHeroDungeonDecision(individual.adventurer,
          progress,individual.replay,layout,result.world,bossReady));
    }
    const agreed=readyGroup.length>1
      ?negotiatePartyFloorDecisions(result.ticks.map(t=>t.adventurer),
        independent):independent;
    for(const individual of result.ticks){
      const id=individual.adventurer.id;
      const count=(stepCounts.get(id)?.steps??0)+1;
      processed.add(id);
      byId.set(id,individual.adventurer);
      const decision=agreed.get(id);
      const planChanged=decision&&!homeward
        ?recordLivePlan(plans,individual.adventurer,decision,tick):false;
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
        (decision?.action==="descend"&&floor<9);
      const stopped=committedHero.status==="dead"||
        committedHero.status==="traveling"||
        (individual.replay.outcome!=="exploring"&&!wantsTravel);
      stepCounts.set(id,{heroId:id,steps:count,finished:stopped});
      if(individual.replay.outcome==="completed"&&floor===7)
        clearedLevel7=true;
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
            (floor===7?{level7Replay:individual.replay}:
              {dungeonReplay:individual.replay}):{}),
          message:`${individual.adventurer.name}'s expedition changed. Details await a report.`,
        });
      }
    }
  }
  const finalRoster=state.adventurers.map(hero=>byId.get(hero.id)!);
  const party=settleLivePartyRelationships(state.dungeonParties??[],
    sharedGroups,finalRoster,floor=>floor===7?level7World:
      earlyDungeonWorlds.find(entry=>entry.floor===floor)?.world??
      emptyLevel7World(),plans,state.seed,day,tick);
  const next:GameState={
    ...state,worldClock:clock,
    dungeonParties:party.parties,
    adventurers:finalRoster,
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
      combatTick:combats.length||bossCombat||partyBossCombat?
        state.liveDungeon.combatTick||tick:0,
      combats,bossCombat,partyBossCombat,returns,plans:[...plans.values()]},
    events:[...state.events,...activities,...party.events],
  };
  const scheduled=queueNextDungeonWorldTick(next);
  const previouslyActive=state.liveDungeon.combats.length>0||
    !!state.liveDungeon.bossCombat||!!state.liveDungeon.partyBossCombat;
  return previouslyActive||!(combats.length||bossCombat||partyBossCombat)?scheduled:
    scheduleLiveCombat(scheduled);
}

/** Run the existing 60Hz group engine on the saved world timeline.
 * Every scheduled 0.5s event advances exactly 30 ticks, or fewer if
 * the fight ends. Read-only replays NEVER call this function.
 */
function commitLiveCombatTick(state:GameState):GameState{
  if(!(state.liveDungeon.combats.length||state.liveDungeon.bossCombat||
      state.liveDungeon.partyBossCombat)||
     state.worldClock.tick!==state.liveDungeon.combatTick+LIVE_COMBAT_INTERVAL_TICKS)
    throw new RangeError("Unscheduled live battle advance.");
  const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  const counts=new Map(state.liveDungeon.heroes.map(h=>[h.heroId,h]));
  let level7World=state.level7World;
  let earlyDungeonWorlds=[...(state.earlyDungeonWorlds??[])];
  const activities:WorldEvent[]=[];
  const continuing:LiveDungeonCombat[]=[];
  let returns=[...state.liveDungeon.returns];
  let clock=state.worldClock;
  let rngState=state.rngState;
  let bossCleared=false;
  const plans=new Map(state.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const sharedGroups:string[][]=state.liveDungeon.combats
    .filter(c=>c.heroIds.length>=2).map(c=>[...c.heroIds]);
  let bossContinuing:LiveBossCombat|null=null;
  const boss=state.liveDungeon.bossCombat;
  if(boss){
    // A live boss is stepped ONLY by this scheduler, not by the camera or
    // the old atomic Level-6 simulator. Its same authored lava/throw motor
    // and Replay v1 source frames remain authoritative.
    const motion:SharedBossPreview=structuredClone(boss.state);
    const frames=[...boss.frames];
    let pending=[...boss.pendingCues];
    for(let i=0;i<LIVE_COMBAT_INTERVAL_TICKS*3&&motion.outcome==="fighting";i++){
      const step=Math.round(motion.time*60)+1;
      if(step>REPLAY_MAX_SECONDS*60)break;
      pending.push(...stepSharedBossPreview(motion,1/60));
      if(step%8===0||motion.outcome!=="fighting"||
          step===REPLAY_MAX_SECONDS*60){
        frames.push(frameFromCombat(motion,pending));
        pending=[];
      }
    }
    const stillFighting=motion.outcome==="fighting"&&
      motion.time<REPLAY_MAX_SECONDS-0.0001;
    if(stillFighting){
      bossContinuing={...boss,state:motion,frames,pendingCues:pending};
    }else{
      const original=byId.get(boss.heroId);
      if(!original)throw new RangeError("Active boss lost its real hero.");
      const outcome:BossCombatReplay["outcome"]=motion.outcome==="victory"
        ?"victory":motion.outcome==="defeat"?"death":"retreat";
      const replay:BossCombatReplay={
        version:1,day:state.day,heroId:original.id,
        role:motion.options.role,sword:motion.options.sword,
        armor:motion.options.armor,maxHp:motion.options.maxHealth,
        outcome,frames,
      };
      const rng=new SeededRandom(rngState);
      const xpGain=outcome==="victory"?35+rng.int(21):0;
      const goldGain=outcome==="victory"?15+rng.int(11):0;
      const lootGain=outcome==="victory"?2+rng.int(2):0;
      rngState=rng.state;
      if(outcome==="victory")bossCleared=true;
      const hp=outcome==="death"?0:Math.max(0,Math.round(motion.heroHp));
      const nextXp=original.xp+xpGain;
      const hero:AdventurerState={
        ...settleHeroExperience(original,nextXp,hp),
        gold:original.gold+goldGain,
        status:hp<=0?"dead":"expedition",floor:6,
        inventory:{...original.inventory,
          healing:motion.healingSupplies,
          loot:original.inventory.loot+lootGain},
      };
      byId.set(hero.id,hero);
      activities.push({
        id:"day-"+state.day+":"+hero.id+":level6-combat",
        type:"level6-combat",day:state.day,
        adventurerId:hero.id,combatOutcome:outcome,combatReplay:replay,
        message:hero.name+" completed a real time-resolved Cave Troll fight: "+
          outcome+". HP "+original.health+"→"+hp+
          ", XP +"+xpGain+", gold +"+goldGain+", loot +"+lootGain+".",
      });
      if(hp<=0)activities.push(deathSignal(hero,state.day,state.worldClock.tick));
      else{
        const journey=beginPortalReturn(hero,state.worldClock.tick,
          clock,returns);
        // This return is queued against the SAME world event, and its
        // scheduled report will be re-applied to the completed next state.
        byId.set(hero.id,journey.hero);
        returns=journey.returns;
        clock=journey.clock;
      }
    }
  }
  let partyBossContinuing:LivePartyBossCombat|null=null;
  const partyBoss=state.liveDungeon.partyBossCombat;
  if(partyBoss){
    const combat:GroupCombatState=structuredClone(partyBoss.state);
    const frames=[...partyBoss.frames];
    for(let i=0;i<LIVE_COMBAT_INTERVAL_TICKS*3&&combat.outcome==="fighting";i++){
      const step=Math.round(combat.time*60)+1;
      if(step>REPLAY_MAX_SECONDS*60){combat.outcome="draw";break;}
      stepGroupCombat(combat);
      if(combat.outcome==="fighting"&&step===REPLAY_MAX_SECONDS*60)
        combat.outcome="draw";
      if(step%6===0||combat.outcome!=="fighting")
        frames.push(captureGroupCombatFrame(combat));
    }
    for(const id of partyBoss.heroIds){
      const before=partyBoss.state.actors.find(a=>a.id===id);
      const after=combat.actors.find(a=>a.id===id);
      if(before&&after&&before.hp>0&&after.hp<=0){
        const hero=byId.get(id);
        if(!hero)throw new RangeError("Boss fighter has no original hero.");
        activities.push(deathSignal(hero,state.day,state.worldClock.tick));
      }
    }
    if(combat.outcome==="fighting"){
      partyBossContinuing={...partyBoss,state:combat,frames};
    }else{
      const winner=combat.outcome==="heroes";
      if(winner)bossCleared=true;
      const living=partyBoss.heroIds.filter(id=>
        (combat.actors.find(a=>a.id===id)?.hp??0)>0).sort();
      const rewardPot=winner?60:0;
      for(const id of partyBoss.heroIds){
        const old=byId.get(id),actor=combat.actors.find(a=>a.id===id);
        if(!old||!actor)
          throw new RangeError("Boss settlement lost a real party actor.");
        const hp=Math.max(0,Math.round(actor.hp));
        const used=Math.min(10,old.inventory.healing)-actor.healCharges;
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
          inventory:{...old.inventory,healing:old.inventory.healing-used,
            loot:old.inventory.loot+(winner&&hp>0?2:0)},
        };
        byId.set(id,hero);
        activities.push({
          id:"day-"+state.day+":"+id+":dungeon-live:"+state.worldClock.tick,
          type:"dungeon-live",day:state.day,worldTick:state.worldClock.tick,
          adventurerId:id,reportedZone:"deep",
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
    // Actors can die BEFORE their surviving companions finish the battle.
    // Emit their signal at that precise authoritative 60Hz batch, once.
    for(const id of fight.heroIds){
      const oldActor=fight.state.actors.find(a=>a.id===id);
      const updated=combat.actors.find(a=>a.id===id);
      if(oldActor&&updated&&oldActor.hp>0&&updated.hp<=0){
        const hero=byId.get(id);
        if(!hero)throw new RangeError("Dead combat actor has no adventurer.");
        activities.push(deathSignal(hero,state.day,state.worldClock.tick));
      }
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
      fight.encounter,combat,replay,fight.arrivals,state.seed);
    if(floor===7)level7World=settled.world;
    else earlyDungeonWorlds=[
      ...earlyDungeonWorlds.filter(entry=>entry.floor!==floor),
      {floor:floor as EarlyDungeonFloorWorld["floor"],world:settled.world},
    ].sort((a,b)=>a.floor-b.floor);
    if(fight.heroIds.length>=2) {
      const survivors=settled.ticks.filter(t=>t.adventurer.health>0)
        .map(t=>t.adventurer.id);
      if(survivors.length>=2)sharedGroups.push(survivors);
    }
    for(const tick of settled.ticks){
      const id=tick.adventurer.id;
      byId.set(id,tick.adventurer);
      if(tick.adventurer.status==="dead"){
        returns=returns.filter(j=>j.heroId!==id);
        plans.delete(id);
      }else {
        const progress=settled.world.heroes.find(p=>p.heroId===id);
        const decision=chooseLiveHeroDungeonDecision(
          tick.adventurer,progress,tick.replay);
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
        ...(floor===7?{level7Replay:tick.replay}:{dungeonReplay:tick.replay}),
        ...(plans.get(id)?{dungeonGoal:plans.get(id)!.goal,
          floorAction:plans.get(id)!.action}:{}),
        message:tick.adventurer.name+"'s life-signature changed during an expedition. Details await a report.",
      });
    }
  }
  const roster=state.adventurers.map(h=>byId.get(h.id)!);
  const parties=settleLivePartyRelationships(state.dungeonParties??[],
    sharedGroups,roster,floor=>floor===7?level7World:
      earlyDungeonWorlds.find(entry=>entry.floor===floor)?.world??
      emptyLevel7World(),plans,state.seed,state.day,state.worldClock.tick);
  const active=continuing.length>0||!!bossContinuing||
    !!partyBossContinuing;
  const next:GameState={...state,
    worldClock:clock,rngState,
    adventurers:roster,dungeonParties:parties.parties,
    earlyDungeonWorlds,level7World,
    dungeonFloors:bossCleared&&
      !state.dungeonFloors.some(f=>f.floor===10&&f.cleared)
        ?[...state.dungeonFloors,{floor:10,cleared:true}]:state.dungeonFloors,
    liveDungeon:{...state.liveDungeon,combats:continuing,
      bossCombat:bossContinuing,partyBossCombat:partyBossContinuing,
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
  if(state.liveDungeon.combats.length||state.liveDungeon.bossCombat||
     state.liveDungeon.partyBossCombat)
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
  const reenteringIds=new Set(closed.adventurers.filter(hero=>
    hero.status==="off-duty"&&hero.offDutyUntilDay!==null&&
    day>=hero.offDutyUntilDay).map(hero=>hero.id));
  const adventurers=closed.adventurers.map(hero=>{
    // Consuming a genuinely owned supply is not free regeneration. Off-duty
    // heroes can use their bread/herbs while resting, rather than return to
    // combat wounded with untouched supplies in their pack.
    const healed=useHealingSupplies(hero,day);
    events.push(...healed.events);
    const ready=healed.adventurer;
    // Two complete off-duty days remain protected from dungeon/shop events.
    if(ready.status==="off-duty"){
      if(!reenteringIds.has(ready.id))return ready;
      // Interim compatibility: the existing individually granted Level-6/7
      // boss permit remains playable, but never bypasses physical shop exit
      // or the two whole off-duty days. The Floor-10 gate is still future work.
      const target=hero.level6Permit&&!previouslyCleared7?
        previouslyCleared6?7 as const:6 as const:1 as const;
      events.push({
        id:`day-${day}:${hero.id}:dungeon-live:${clock.tick}`,type:"dungeon-live",day,
        worldTick:clock.tick,adventurerId:hero.id,
        reportedZone:target>=6?"deep" as const:"upper" as const,
        message:`${hero.name} began a new expedition after two full days away.`,
      });
      return {...ready,status:target===1?"exploring" as const:"expedition" as const,
        floor:target,offDutyUntilDay:null};
    }
    if(ready.status==="returning"&&ready.floor>=1&&ready.floor<=4)
      return {...ready,status:"exploring" as const};
    // Sleeping cannot complete a portal journey which is still scheduled
    // for a subsequent live world tick.
    if(ready.status==="traveling")return ready;
    // Permit ownership cannot silently teleport a visitor to a boss at dawn.
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
  // Reenter at a seeded known floor ENTRANCE, never the last fight tile;
  // retain personally visited cells, site generations and other heroes.
  let morningWorlds=closed.earlyDungeonWorlds??[];
  let morningLevel7=closed.level7World;
  for(const floor of [1,7] as const){
    const ids=adventurers.filter(h=>reenteringIds.has(h.id)&&h.floor===floor)
      .map(h=>h.id);
    if(!ids.length)continue;
    const layout=generateExpeditionLayout(state.seed,floor);
    const saved=floor===7?morningLevel7:
      morningWorlds.find(w=>w.floor===1)?.world??emptyLevel7World();
    const heroes=[...saved.heroes];
    const spawn=layout.entrance,cell=spawn.z*layout.width+spawn.x;
    for(const id of ids){
      const oldIndex=heroes.findIndex(h=>h.heroId===id);
      const old=oldIndex>=0?heroes[oldIndex]:null;
      const landed={heroId:id,...spawn,visited:old?
        old.visited.includes(cell)?old.visited:[...old.visited,cell]:[cell]};
      if(oldIndex>=0)heroes[oldIndex]=landed;
      else heroes.push(landed);
    }
    if(floor===7)morningLevel7={...saved,heroes};
    else morningWorlds=[...morningWorlds.filter(w=>w.floor!==1),
      {floor:1 as const,world:{...saved,heroes}}].sort((a,b)=>a.floor-b.floor);
  }
  const next:GameState={
    ...closed,day,worldClock:clock,earlyDungeonWorlds:morningWorlds,
    level7World:morningLevel7,
    shopTraffic:{day,tick:clock.tick,initialized:false,actors:[],
      claims:[],shelfOwners:[],doorY:{level4:0,level6:0}},
    shopEconomy:{...closed.shopEconomy,
      dailySales:{day,units:0,revenue:0}},
    adventurers,rngState,
    nextAdventurerId:state.nextAdventurerId+influx,
    liveDungeon:{enabled:true,lastStepTick:clock.tick,heroes:[],
      combatTick:0,combats:[],bossCombat:null,partyBossCombat:null,
      returns:state.liveDungeon.returns,
      plans:state.liveDungeon.plans.filter(plan=>
        adventurers.some(h=>h.id===plan.heroId&&h.floor===plan.floor&&
          h.health>0&&(h.status==="exploring"||h.status==="expedition")))},
    events:[...state.events,...events],
  };
  const finalPlans=new Map(next.liveDungeon.plans.map(p=>[p.heroId,p] as const));
  const party=settleLivePartyRelationships(state.dungeonParties??[],
    [],adventurers,floor=>floor===7?next.level7World:
      next.earlyDungeonWorlds?.find(e=>e.floor===floor)?.world??
      emptyLevel7World(),finalPlans,state.seed,day,clock.tick);
  const committed={...next,dungeonParties:party.parties,
    events:compactReplayFootage([...next.events,...party.events],
      day,state.savedReplayIds)};
  return {state:queueNextDungeonWorldTick(committed),
    events:[...events,...party.events]};
}
