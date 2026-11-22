import { createLevel5Room, type Level5Room } from "./level5Room.ts";
import {createCellarRoom,DEFAULT_CELLAR_CHEST,DEFAULT_CELLAR_TABLE,
  type CellarChestPlacement,type CellarTablePlacement,type CellarRoom} from "./cellarRoom.ts";
import { beginNextWorldDay, createWorldClock, MAX_WORLD_DAY, type WorldClockState } from "./worldClock.ts";
import {emptyShopTraffic,type ShopTrafficCheckpoint} from "./shopTraffic.ts";
import {createLiveDungeonState,finishLiveDungeonDay,
  type LiveDungeonState} from "./liveDungeonRuntime.ts";
import type {ShopRequest} from "./shopRuntime.ts";
import { useHealingSupplies, generateAdventurer, generateStartingPopulation, type AdventurerState } from "./adventurers.ts";
import { createEconomy, type ItemId, type MaterialItemId, type Slot } from "./economy.ts";
import {
  chooseHeroDungeonDecision,
  type HeroDungeonDecision, type HeroDungeonGoal, type HeroFloorAction,
} from "./dungeonDecisions.ts";
import { generateExpeditionLayout } from "./dungeonLayout.ts";
import {
  choosePersistentDungeonParty, negotiatePartyFloorDecisions,
  settlePersistentDungeonParties, temporaryPartyChanges,
  type DungeonPartyState,
} from "./dungeonParties.ts";
import type { BossCombatReplay } from "./bossCombatReplay.ts";
import type {GroupCombatReplay} from "./groupCombat.ts";
import {compactReplayFootage} from "./replayRetention.ts";
import {
  emptyLevel7World, getLevel7Progress,
  simulateSpatialDungeonPartyDay,
  type Level7Replay, type Level7World, type Level7Tick,
  type SpatialDungeonFloor,
} from "./level7Exploration.ts";
import { DEFAULT_SEED, SeededRandom } from "./random.ts";
import { createShopLayout, type ShopLayout } from "./shopLayout.ts";
import { createBedroomFurnitureLayout, type BedroomFurnitureLayout } from "./bedroomFurniture.ts";
import { DEFAULT_ROSTER_BOARD,type RosterBoardPlacement } from "./rosterBoardPlacement.ts";
import type {WallPortraitPlacement} from "./wallPortraitPlacement.ts";
import { returnUnpaidCartsAtClose, type ShopCart } from "./shopCarts.ts";
import { arrivalEvent, scheduleShopVisit } from "./shopArrivals.ts";

export type { AdventurerState } from "./adventurers.ts";
export const SIMULATION_VERSION = 32;

/** Kept for read-only historical v13 outcome records. No live roll simulation. */
export type DungeonOutcome = "advance" | "stay" | "retreat" | "death";
export interface EarlyDungeonFloorWorld {
  readonly floor: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9;
  readonly world: Level7World;
}

export interface ShopEconomyState {
  readonly balance: number;
  readonly bag: Record<ItemId, number>;
  /** Separate forge-input reserve. Not a bag slot, shelf, wholesale good or hotbar item. */
  readonly materialStorage:Record<MaterialItemId,number>;
  readonly slots: Slot[];
  readonly dailySales: { readonly day: number; readonly units: number; readonly revenue: number };
}

export interface DungeonFloorProgress {
  readonly floor: number;
  readonly cleared: boolean;
}

export interface PopulationConfig {
  readonly dailyInflux: number;
  readonly maxActive: number;
}

export interface WorldEvent {
  readonly id: string;
  readonly type: "welcome" | "day-started" | "dungeon-outcome" | "shop-arrival" | "shop-stay" | "shop-departure" | "shop-walkout" | "influx" |
    "sale" | "tip" | "healed" |
    "level6-departure" | "level6-combat" | "level6-return" |
    "level7-departure" | "level7-exploration" | "shop-credit" |
    "dungeon-exploration" | "dungeon-live" | "hero-death-signal" |
    "temporary-party-join" | "temporary-party-leave" | "hero-buyback";
  readonly day: number;
  readonly message: string;
  readonly worldTick?: number;
  /** Explicit limited magical observation. Never inferred from sealed footage. */
  readonly reportedZone?: "upper"|"deep";
  /** Highlight from a committed step, never passive Board knowledge. */
  readonly dungeonHighlight?: "treasure"|"trap";
  readonly shopReason?: "unavailable"|"cannot-afford"|"no-need"|"interested";
  readonly adventurerId?: string;
  readonly outcome?: DungeonOutcome;
  readonly combatOutcome?: "victory" | "retreat" | "death";
  /** Exact replay of the committed fixed-step combat. Older events omit this. */
  readonly combatReplay?: BossCombatReplay;
  /** Full 60Hz archived Cave Troll PARTY fight; no recomputation after death. */
  readonly partyBossReplay?:GroupCombatReplay;
  /** Committed path and battles of one Level 7 day. */
  readonly level7Replay?: Level7Replay;
  /** Same shared spatial engine/format on an earlier numbered floor. */
  readonly dungeonReplay?: Level7Replay;
  /** Autonomous strategy and directional choice after the day's real exploration. */
  readonly dungeonGoal?: HeroDungeonGoal;
  readonly floorAction?: HeroFloorAction;
  readonly itemId?: ItemId;
  readonly quantity?: number;
  readonly revenue?: number;
  /** Gold paid to an adventurer for a recovered dungeon item; not sales revenue. */
  readonly cost?: number;
  /** Manual cash register vs. automated settlement; absent means legacy auto sale. */
  readonly saleChannel?: "manual" | "reserved";
  /** Face value written to the merchant debt ledger; no cash was earned. */
  readonly debtGold?: number;
}

/** Per-hero outstanding credit. Never counted as received cash. */
export interface ShopDebt {
  readonly heroId: string;
  readonly outstandingGold: number;
}

export interface GameState {
  readonly day: number;
  readonly worldClock: WorldClockState;
  readonly shopRequests: readonly ShopRequest[];
  readonly shopTraffic: ShopTrafficCheckpoint;
  readonly liveDungeon: LiveDungeonState;
  readonly simulationVersion: number;
  readonly events: readonly WorldEvent[];
  /** Explicitly saved tapes exempt from two-day frame expiry. */
  readonly savedReplayIds:readonly string[];
  readonly adventurers: readonly AdventurerState[];
  readonly shopEconomy: ShopEconomyState;
  readonly shopLayout: ShopLayout;
  readonly bedroomFurniture: BedroomFurnitureLayout;
  readonly rosterBoard: RosterBoardPlacement;
  /** Optional one-of-a-kind wall decoration, absent until the player hangs it. */
  readonly wallPortrait?: WallPortraitPlacement;
  readonly shopRoom: Level5Room;
  readonly cellarRoom: CellarRoom;
  readonly cellarChest: CellarChestPlacement;
  readonly cellarTable: CellarTablePlacement;
  readonly cellarDoorOpen: boolean;
  /** Fishing score only; fish goods will use the normal economy when added. */
  readonly cellarFishCaught: number;
  readonly shopCarts: readonly ShopCart[];
  readonly shopDebts: readonly ShopDebt[];
  readonly dungeonFloors: readonly DungeonFloorProgress[];
  readonly level7World: Level7World;
  /** v13-compatible optional extension; no independent early-floor RNG engine. */
  readonly earlyDungeonWorlds?: readonly EarlyDungeonFloorWorld[];
  /** Optional v13-compatible, saved voluntary multi-day dungeon groups. */
  readonly dungeonParties?: readonly DungeonPartyState[];
  readonly seed: number;
  readonly rngState: number;
  readonly populationConfig: PopulationConfig;
  readonly nextAdventurerId: number;
}

const DEFAULT_POPULATION: PopulationConfig = { dailyInflux: 2, maxActive: 20 };

function validatePopulation(config: PopulationConfig): void {
  if (!Number.isSafeInteger(config.dailyInflux) || config.dailyInflux < 0 ||
      !Number.isSafeInteger(config.maxActive) || config.maxActive < 10 || config.maxActive > 100) {
    throw new RangeError("Population requires nonnegative integer daily influx and 10–100 active slots.");
  }
}

export function createGameState(seed = DEFAULT_SEED, config: Partial<PopulationConfig> = {}): GameState {
  const populationConfig = { ...DEFAULT_POPULATION, ...config };
  validatePopulation(populationConfig);
  const generated = generateStartingPopulation(seed);
  const adventurers = generated.adventurers;
  return {
    day: 1,
    worldClock: createWorldClock(),
    shopRequests: [],
    shopTraffic:emptyShopTraffic(1,0),
    liveDungeon:createLiveDungeonState(),
    simulationVersion: SIMULATION_VERSION,
    savedReplayIds:[],
    events: [
      ...adventurers.slice(0, 3).map((hero) => arrivalEvent(hero, 1)),
      { id: "day-1:welcome", type: "welcome", day: 1, message: "Welcome to Day 1. The shop is ready." },
    ],
    adventurers,
    shopEconomy: createEconomy(),
    shopLayout: createShopLayout(),
    bedroomFurniture: createBedroomFurnitureLayout(),
    rosterBoard: DEFAULT_ROSTER_BOARD,
    shopRoom: createLevel5Room(),
    cellarRoom: createCellarRoom(),
    cellarChest: {...DEFAULT_CELLAR_CHEST},
    cellarTable: {...DEFAULT_CELLAR_TABLE},
    cellarDoorOpen: false,
    cellarFishCaught: 0,
    shopCarts: [],
    shopDebts: [],
    dungeonFloors: [],
    level7World: emptyLevel7World(),
    earlyDungeonWorlds: [],
    dungeonParties: [],
    seed,
    rngState: generated.rngState,
    populationConfig,
    nextAdventurerId: 11,
  };
}

export function advanceDay(state: GameState): { state: GameState; events: readonly WorldEvent[] } {
  if(state.liveDungeon.enabled)return finishLiveDungeonDay(state);
  // Legacy test/fixture owner is exclusive with liveDungeon.enabled.
  // No production campaign with live time may run the old spatial batch.
  if (!Number.isSafeInteger(state.day) || state.day < 1 || state.day >= MAX_WORLD_DAY) {
    throw new RangeError("The current day must be a positive safe integer with room for one more day.");
  }
  if (state.simulationVersion !== SIMULATION_VERSION) {
    throw new RangeError("Unsupported simulation version.");
  }
  const day = state.day + 1;
  const worldClock = beginNextWorldDay(state.worldClock, state.day);
  validatePopulation(state.populationConfig);
  let rngState = new SeededRandom(state.rngState).state;
  const events: WorldEvent[] = [{ id: `day-${day}:started`, type: "day-started", day, message: `Day ${day} begins.` }];
  // PR #202: no invisible merchant business while Galvik sleeps.
  // Physical pickup only reserves goods. If the cashier never accepted
  // payment, return those goods to their original shelf at shop close.
  // Manual checkout and issued credit are the ONLY daytime handovers.
  const closed=returnUnpaidCartsAtClose(state);
  const paidIds=new Set<string>();
  for(const event of state.events){
    if(event.type==="sale"&&event.saleChannel==="manual"&&
       event.day===state.day&&event.adventurerId)
      paidIds.add(event.adventurerId);
  }
  const nextEconomy={
    ...closed.shopEconomy,
    dailySales:{day,units:0,revenue:0},
  };
  const postTradeHeroes=closed.adventurers;
  let clearedLevel7 = state.dungeonFloors.some((entry) => entry.floor === 7 && entry.cleared);
  let level7World = state.level7World;
  let earlyDungeonWorlds: EarlyDungeonFloorWorld[] =
    [...(state.earlyDungeonWorlds??[])];
  // Compute real pre-expedition healing for everyone before picking a party,
  // including companions whose entries come later in the stable roster.
  // Their healing events still commit once when each roster entry is visited.
  const healed=postTradeHeroes.map(hero=>useHealingSupplies(hero,day));
  const readyRoster=healed.map(result=>{
    const ready=result.adventurer;
    return ready.status==="returning"&&ready.floor>=1&&ready.floor<=9
      ?{...ready,status:"exploring" as const}:ready;
  });
  const committedFights=new Map<string,Level7Tick>();
  // Propose and negotiate as a group immediately after the ONE fight,
  // before roster ordering can cause the first hero to depart early.
  const coordinatedDecisions=new Map<string,HeroDungeonDecision>();
  const processed=new Set<string>();
  const sharedEncounters:string[][]=[];
  const floorChoices=new Map<string,HeroFloorAction>();
  const adventurers = postTradeHeroes.map((hero,index) => {
    // Newly authorized departures cannot fight on their departure day.
    events.push(...healed[index].events);
    const ready = readyRoster[index];
    if(ready.status==="exploring"&&ready.floor>=1&&ready.floor<=9){
      const floor=ready.floor as SpatialDungeonFloor;
      const world=floor===7?level7World:
        earlyDungeonWorlds.find(entry=>entry.floor===floor)?.world ??
        emptyLevel7World();
      let tick=committedFights.get(ready.id);
      if(!tick){
        const layout=generateExpeditionLayout(state.seed,floor);
        const group=choosePersistentDungeonParty(ready,readyRoster,world,
          layout,processed,state.dungeonParties??[]);
        if(group.length>1)sharedEncounters.push(group.map(member=>member.id));
        const activeIds=new Set(readyRoster.filter(person=>
          person.status==="exploring"&&person.floor===floor).map(p=>p.id));
        const result=simulateSpatialDungeonPartyDay(group,world,state.seed,
          day,activeIds);
        const proposals=new Map<string,HeroDungeonDecision>();
        for(const individual of result.ticks){
          committedFights.set(individual.adventurer.id,individual);
          processed.add(individual.adventurer.id);
          if(individual.adventurer.status==="exploring"){
            const progress=getLevel7Progress(result.world,
              individual.adventurer.id,layout);
            proposals.set(individual.adventurer.id,
              chooseHeroDungeonDecision(individual.adventurer,
                progress,individual.replay));
          }
        }
        const negotiations=negotiatePartyFloorDecisions(
          result.ticks.filter(t=>proposals.has(t.adventurer.id))
            .map(t=>t.adventurer),proposals);
        for(const [id,decision] of negotiations)
          coordinatedDecisions.set(id,decision);
        if(floor===7)level7World=result.world;
        else earlyDungeonWorlds=[
          ...earlyDungeonWorlds.filter(entry=>entry.floor!==floor),
          {floor:floor as EarlyDungeonFloorWorld["floor"],world:result.world},
        ].sort((a,b)=>a.floor-b.floor);
        tick=committedFights.get(ready.id)!;
      }
      const progress=getLevel7Progress(tick.world,ready.id,
        generateExpeditionLayout(state.seed,floor));
      const decision=(tick.adventurer.status!=="exploring"&&
        !(tick.adventurer.floor===7&&tick.adventurer.status==="expedition"))
        ?null:coordinatedDecisions.get(ready.id) ??
          chooseHeroDungeonDecision(tick.adventurer,progress,tick.replay);
      if(decision)floorChoices.set(ready.id,decision.action);
      const moved=decision?.action==="descend"&&floor<9
        ? {...tick.adventurer,floor:(floor+1) as SpatialDungeonFloor}
        : decision?.action==="ascend"&&floor>1
        ? {...tick.adventurer,floor:(floor-1) as SpatialDungeonFloor}
        : decision?.action==="shop"
        ? {...tick.adventurer,status:"traveling" as const,floor:4 as const}
        : tick.adventurer;
      if(floor===7)events.push({
        id:`day-${day}:${ready.id}:level7-exploration`,
        type:"level7-exploration",day,adventurerId:ready.id,
        level7Replay:tick.replay,
        message:`${ready.name}'s Floor 7 expedition was recorded.`,
      });
      else events.push({
        id:`day-${day}:${ready.id}:dungeon-exploration`,
        type:"dungeon-exploration",day,adventurerId:ready.id,
        dungeonReplay:tick.replay,
        ...(decision?{dungeonGoal:decision.goal,floorAction:decision.action}:{}),
        message:`${ready.name}'s Floor ${floor} expedition was recorded. Watch the saved footage to discover the outcome.`,
      });
      const shop=scheduleShopVisit(moved,day,rngState,paidIds.has(ready.id));
      rngState=shop.rngState;
      events.push(...shop.events);
      return shop.adventurer;
    }
    if(ready.status==="expedition"&&ready.floor===7){
      let tick=committedFights.get(ready.id);
      if(!tick){
        const layout=generateExpeditionLayout(state.seed,7);
        const group=choosePersistentDungeonParty(ready,readyRoster,level7World,
          layout,processed,state.dungeonParties??[]);
        if(group.length>1)sharedEncounters.push(group.map(member=>member.id));
        const activeIds=new Set(readyRoster.filter(person=>
          person.status==="expedition"&&person.floor===7).map(p=>p.id));
        const result=simulateSpatialDungeonPartyDay(group,level7World,
          state.seed,day,activeIds);
        for(const individual of result.ticks){
          committedFights.set(individual.adventurer.id,individual);
          processed.add(individual.adventurer.id);
        }
        level7World=result.world;
        tick=committedFights.get(ready.id)!;
      }
      if(tick.replay.outcome==="completed")clearedLevel7=true;
      events.push({
        id:`day-${day}:${ready.id}:level7-exploration`,
        type:"level7-exploration",day,adventurerId:ready.id,
        level7Replay:tick.replay,
        message:`${ready.name}'s Level 7 expedition was recorded. Watch the saved footage to discover what happened.`,
      });
      return tick.adventurer;
    }
    // Old Alpha saves are intentionally unsupported: a solitary Floor-6
    // "expedition" has no meaning in the current ordinary-floor topology.
    // In particular, no daily closure may secretly launch a Cave Troll.
    if (ready.status === "expedition" && ready.floor === 6)
      throw new RangeError("Floor 6 has no solo boss expedition.");
    // The old Floors 1–4 damage/progress dice were retired; live early
    // explorers were already processed by the spatial engine above.
    const shop=scheduleShopVisit(ready,day,rngState,paidIds.has(hero.id));
    rngState=shop.rngState;
    events.push(...shop.events);
    return shop.adventurer;
  });
  const active = adventurers.filter((hero) => hero.status !== "dead").length;
  const influx = Math.min(state.populationConfig.dailyInflux,
    Math.max(0, state.populationConfig.maxActive - active));
  for (let index = 0; index < influx; index += 1) {
    const generated = generateAdventurer(state.nextAdventurerId + index, rngState);
    rngState = generated.rngState;
    const hero = generated.adventurer;
    adventurers.push(hero);
    events.push({
      id: `day-${day}:${hero.id}:influx`, type: "influx", day, adventurerId: hero.id,
      message: `${hero.name} entered the dungeon on floor 1.`,
    });
  }
  // Persistent visited routes belong to living heroes even after moving
  // between floors. Dead heroes cannot return to any floor, however: leaving
  // their historical navigation records in every old world eventually
  // exceeds the strict save cap and misrepresents physical occupancy.
  // Their committed event/replay history remains untouched.
  const livingIds=new Set(adventurers.filter(hero=>hero.status!=="dead")
    .map(hero=>hero.id));
  level7World={...level7World,
    heroes:level7World.heroes.filter(progress=>livingIds.has(progress.heroId))};
  earlyDungeonWorlds=earlyDungeonWorlds.map(entry=>({
    ...entry,world:{...entry.world,
      heroes:entry.world.heroes.filter(progress=>livingIds.has(progress.heroId))},
  }));
  // Durable party links survive a day and a consensual floor transition
  // only when every surviving member still occupies the SAME tile on the
  // SAME numbered floor. Individual choices can dissolve a relationship.
  const dungeonParties=settlePersistentDungeonParties(
    state.dungeonParties??[],sharedEncounters,adventurers,
    (floor:SpatialDungeonFloor)=>floor===7?level7World:
      earlyDungeonWorlds.find(entry=>entry.floor===floor)?.world??
      emptyLevel7World(),
    state.seed,day,floorChoices,
  );
  // Emit one legitimate join/leave per member and kind, only on a
  // committed day transition. No UI, replay playback or renderer can
  // mutate this relationship or reroll its events.
  const named=new Map(adventurers.map(hero=>[hero.id,hero.name]));
  for(const change of temporaryPartyChanges(
    state.dungeonParties??[],sharedEncounters,dungeonParties)){
    const companions=change.memberIds.filter(id=>id!==change.heroId)
      .map(id=>named.get(id)??id);
    const name=named.get(change.heroId)??change.heroId;
    const type=change.action==="join"
      ?"temporary-party-join" as const:"temporary-party-leave" as const;
    events.push({
      id:`day-${day}:${change.heroId}:${type}`,
      type,day,adventurerId:change.heroId,
      message:change.action==="join"
        ?`${name} joined a Temporary Party with ${companions.join(" and ")}.`
        :`${name} left their Temporary Party.`,
    });
  }
  // Retain actual facts permanently; purge large unpinned frames after
  // two completed days. Historical readers never re-simulate expired footage.
  const compactedEvents=compactReplayFootage(
    [...state.events,...events],day,state.savedReplayIds);
  return {
    state: {
      ...closed, day, worldClock,shopTraffic:emptyShopTraffic(day,worldClock.tick),
      adventurers, rngState, shopEconomy: nextEconomy,
      level7World,
      earlyDungeonWorlds,
      dungeonParties,
      dungeonFloors: [
        ...state.dungeonFloors,
        ...(clearedLevel7 && !state.dungeonFloors.some(f=>f.floor===7&&f.cleared)
          ? [{floor:7,cleared:true}]:[]),
      ],
      nextAdventurerId: state.nextAdventurerId + influx,
      events: compactedEvents,
    },
    events,
  };
}

/** Grant/revoke an explicit Floor-10 Temporary-Party Boss Pass only
 * for a living hero visiting Galvik's shop. No old-format save migrations.
 */
export function setBossPass(state: GameState, heroId: string, permitted: boolean): GameState {
  if (typeof permitted !== "boolean") throw new TypeError("Boss pass must be boolean.");
  const hero = state.adventurers.find((entry) => entry.id === heroId);
  if (!hero || hero.status !== "at-shop" || hero.health <= 0 || hero.bossPass === permitted) return state;
  return {
    ...state,
    adventurers: state.adventurers.map((entry) =>
      entry.id === heroId ? { ...entry, bossPass: permitted } : entry),
  };
}

export type DayAction = "request" | "confirm" | "cancel";

export function transitionDayConfirmation(pending: boolean, action: DayAction) {
  return {
    pending: action === "request",
    advance: pending && action === "confirm",
  };
}
