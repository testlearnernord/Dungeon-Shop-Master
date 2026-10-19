import { consumeDailySupplies, generateAdventurer, generateStartingPopulation, type AdventurerState } from "./adventurers.ts";
import { createEconomy, tradeAtStartOfDay, type ItemId, type Slot } from "./economy.ts";
import { simulateDungeon, type DungeonOutcome } from "./dungeonSimulation.ts";
import { DEFAULT_SEED, SeededRandom } from "./random.ts";
import { arrivalEvent, scheduleShopVisit } from "./shopArrivals.ts";

export type { AdventurerState } from "./adventurers.ts";
export const SIMULATION_VERSION = 3;

export interface ShopEconomyState {
  readonly balance: number;
  readonly bag: Record<ItemId, number>;
  readonly slots: Slot[];
  readonly dailySales: { readonly day: number; readonly units: number; readonly revenue: number };
  readonly lastRescueDay: number | null;
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
  readonly type: "welcome" | "day-started" | "dungeon-outcome" | "shop-arrival" | "shop-stay" | "shop-departure" | "influx" |
    "sale" | "ate" | "healed" | "starvation" | "rescue";
  readonly day: number;
  readonly message: string;
  readonly adventurerId?: string;
  readonly outcome?: DungeonOutcome;
  readonly itemId?: ItemId;
  readonly quantity?: number;
  readonly revenue?: number;
}

export interface GameState {
  readonly day: number;
  readonly simulationVersion: number;
  readonly events: readonly WorldEvent[];
  readonly adventurers: readonly AdventurerState[];
  readonly shopEconomy: ShopEconomyState;
  readonly dungeonFloors: readonly DungeonFloorProgress[];
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
    simulationVersion: SIMULATION_VERSION,
    events: [
      ...adventurers.slice(0, 3).map((hero) => arrivalEvent(hero, 1)),
      { id: "day-1:welcome", type: "welcome", day: 1, message: "Welcome to Day 1. The shop is ready." },
    ],
    adventurers,
    shopEconomy: createEconomy(),
    dungeonFloors: [],
    seed,
    rngState: generated.rngState,
    populationConfig,
    nextAdventurerId: 11,
  };
}

export function advanceDay(state: GameState): { state: GameState; events: readonly WorldEvent[] } {
  if (!Number.isSafeInteger(state.day) || state.day < 1 || state.day >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("The current day must be a positive safe integer with room for one more day.");
  }
  if (state.simulationVersion !== SIMULATION_VERSION) {
    throw new RangeError("Unsupported simulation version.");
  }
  const day = state.day + 1;
  validatePopulation(state.populationConfig);
  let rngState = new SeededRandom(state.rngState).state;
  const events: WorldEvent[] = [{ id: `day-${day}:started`, type: "day-started", day, message: `Day ${day} begins.` }];
  // Rescue/trade for today's existing customers, consume supplies, resolve hazards,
  // then travel/departures and vacancy-driven newcomers. Dead heroes never change.
  const trade = tradeAtStartOfDay(state, day);
  events.push(...trade.events);
  const adventurers = trade.adventurers.map((hero) => {
    const supplies = consumeDailySupplies(hero, day);
    const dungeon = simulateDungeon(supplies.adventurer, day, rngState);
    const shop = scheduleShopVisit(dungeon.adventurer, day, dungeon.rngState);
    rngState = shop.rngState;
    events.push(...supplies.events, ...dungeon.events, ...shop.events);
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
  return {
    state: {
      ...state, day, adventurers, rngState, shopEconomy: trade.economy,
      nextAdventurerId: state.nextAdventurerId + influx,
      events: [...state.events, ...events],
    },
    events,
  };
}

export type DayAction = "request" | "confirm" | "cancel";

export function transitionDayConfirmation(pending: boolean, action: DayAction) {
  return {
    pending: action === "request",
    advance: pending && action === "confirm",
  };
}
