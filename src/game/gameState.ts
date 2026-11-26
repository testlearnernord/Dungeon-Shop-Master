import { createShopRoomGeometry, type ShopRoomGeometry } from "./shopRoomGeometry.ts";
import {createCellarRoom,DEFAULT_CELLAR_CHEST,DEFAULT_CELLAR_TABLE,
  type CellarChestPlacement,type CellarTablePlacement,type CellarRoom} from "./cellarRoom.ts";
import {createWorldClock,advanceWorldUntil,lastWorldTickOfDay,MAX_WORLD_DAY,type WorldClockState} from "./worldClock.ts";
import {emptyShopTraffic,type ShopTrafficCheckpoint} from "./shopTraffic.ts";
import {activateLiveDungeon,createLiveDungeonState,finishLiveDungeonDay,
  commitLiveWorldEvent,type LiveDungeonState} from "./liveDungeonRuntime.ts";
import {closeShopRequests,type ShopRequest} from "./shopRuntime.ts";
import { generateStartingPopulation, type AdventurerState } from "./adventurers.ts";
import { createEconomy, type ItemId, type MaterialItemId, type Slot } from "./economy.ts";
import {type HeroDungeonGoal,type HeroFloorAction} from "./dungeonDecisions.ts";
import type {DungeonPartyState} from "./dungeonParties.ts";
import type {GroupCombatReplay} from "./groupCombat.ts";
import type {SpatialDungeonReplay} from "./spatialDungeonExploration.ts";
import type {DungeonFloorWorld} from "./dungeonWorldState.ts";
import { DEFAULT_SEED } from "./random.ts";
import { createShopLayout, type ShopLayout } from "./shopLayout.ts";
import { createBedroomFurnitureLayout, type BedroomFurnitureLayout } from "./bedroomFurniture.ts";
import { DEFAULT_ROSTER_BOARD,type RosterBoardPlacement } from "./rosterBoardPlacement.ts";
import type {WallPortraitPlacement} from "./wallPortraitPlacement.ts";
import {DEFAULT_WALL_CLOCK,type WallClockPlacement} from "./wallClockPlacement.ts";
import type {ShopCart} from "./shopCarts.ts";
import {arrivalEvent} from "./shopArrivals.ts";
import {createEmployees,type EmployeeState} from "./employees.ts";

export type { AdventurerState } from "./adventurers.ts";
export const SIMULATION_VERSION = 47;

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
  readonly type: "welcome" | "day-started" | "shop-arrival" | "shop-stay" |
    "shop-departure" | "shop-walkout" | "influx" | "sale" | "tip" | "healed" |
    "shop-credit" | "dungeon-live" | "hero-death-signal" |
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
  /** Full 60Hz archived Cave Troll PARTY fight; no recomputation after death. */
  readonly partyBossReplay?:GroupCombatReplay;
  /** Any ordinary Floor 1–9 uses this one immutable committed spatial tape. */
  readonly dungeonReplay?: SpatialDungeonReplay;
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
  readonly employees:readonly EmployeeState[];
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
  /** One physical clock prop; every instance only reads worldClock.tick. */
  readonly wallClock: WallClockPlacement;
  /** Optional one-of-a-kind wall decoration, absent until the player hangs it. */
  readonly wallPortrait?: WallPortraitPlacement;
  readonly shopRoom: ShopRoomGeometry;
  readonly cellarRoom: CellarRoom;
  readonly cellarChest: CellarChestPlacement;
  readonly cellarTable: CellarTablePlacement;
  readonly cellarDoorOpen: boolean;
  readonly buybackChestOpen:boolean;
  /** Fishing score only; fish goods will use the normal economy when added. */
  readonly cellarFishCaught: number;
  readonly shopCarts: readonly ShopCart[];
  readonly shopDebts: readonly ShopDebt[];
  readonly dungeonFloors: readonly DungeonFloorProgress[];
  /** Canonical spatial state for ordinary Dungeon Floors 1–9. */
  readonly dungeonWorlds: readonly DungeonFloorWorld[];
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
    employees:createEmployees(),
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
    wallClock: {...DEFAULT_WALL_CLOCK},
    shopRoom: createShopRoomGeometry(),
    cellarRoom: createCellarRoom(),
    cellarChest: {...DEFAULT_CELLAR_CHEST},
    cellarTable: {...DEFAULT_CELLAR_TABLE},
    cellarDoorOpen: false,
    buybackChestOpen:true,
    cellarFishCaught: 0,
    shopCarts: [],
    shopDebts: [],
    dungeonFloors: [],
    dungeonWorlds: [],
    dungeonParties: [],
    seed,
    rngState: generated.rngState,
    populationConfig,
    nextAdventurerId: 11,
  };
}

/** One real event scheduler processes every pending tick BEFORE bedtime.
 * A pure fixture entering without a LIVE flag activates the same production
 * motor; it does not invoke an alternative seeded day-long loot/combat roll.
 */
export function advanceDay(state:GameState):{state:GameState;events:readonly WorldEvent[]}{
  if(state.simulationVersion!==SIMULATION_VERSION)
    throw new RangeError("Unsupported simulation version.");
  if(!Number.isSafeInteger(state.day)||state.day<1||state.day>=MAX_WORLD_DAY)
    throw new RangeError("The current day is outside the supported range.");
  if(state.adventurers.some(hero=>hero.status==="expedition"&&hero.floor!==10))
    throw new RangeError("Only Floor 10 supports boss expedition status.");
  const live=state.liveDungeon.enabled?state:activateLiveDungeon(state);
  const settled=advanceWorldUntil(live,lastWorldTickOfDay(live.day),
    commitLiveWorldEvent);
  const finished=finishLiveDungeonDay(closeShopRequests(settled));
  const priorIds=new Set(state.events.map(event=>event.id));
  return {state:finished.state,events:finished.state.events.filter(event=>
    !priorIds.has(event.id))};
}

export type DayAction = "request" | "confirm" | "cancel";

export function transitionDayConfirmation(pending: boolean, action: DayAction) {
  return {
    pending: action === "request",
    advance: pending && action === "confirm",
  };
}
