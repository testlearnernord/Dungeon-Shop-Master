import { generateAdventurer, generateStartingPopulation, type AdventurerState } from "./adventurers.ts";
import { simulateDungeon, type DungeonOutcome } from "./dungeonSimulation.ts";
import { DEFAULT_SEED, SeededRandom } from "./random.ts";
import { arrivalEvent, scheduleShopVisit } from "./shopArrivals.ts";

export type { AdventurerState } from "./adventurers.ts";
export const SIMULATION_VERSION = 2;

export interface ShopEconomyState {
  readonly balance: number;
}

export interface DungeonFloorProgress {
  readonly floor: number;
  readonly cleared: boolean;
}

export interface PopulationConfig {
  readonly dailyInflux: number;
  readonly maxActive: number;
  readonly totalInflux: number;
}

export interface WorldEvent {
  readonly id: string;
  readonly type: "welcome" | "day-started" | "dungeon-outcome" | "shop-arrival" | "shop-stay" | "shop-departure" | "influx";
  readonly day: number;
  readonly message: string;
  readonly adventurerId?: string;
  readonly outcome?: DungeonOutcome;
}

export interface GameState {
  readonly day: number;
  readonly simulationVersion: number;
  readonly events: readonly WorldEvent[];
  readonly adventurers: readonly AdventurerState[];
  readonly shopEconomy: ShopEconomyState | null;
  readonly dungeonFloors: readonly DungeonFloorProgress[];
  readonly seed: number;
  readonly rngState: number;
  readonly populationConfig: PopulationConfig;
  readonly influxRemaining: number;
  readonly nextAdventurerId: number;
}

const DEFAULT_POPULATION: PopulationConfig = { dailyInflux: 2, maxActive: 20, totalInflux: 30 };

function validatePopulation(config: PopulationConfig): void {
  if (!Number.isSafeInteger(config.dailyInflux) || config.dailyInflux < 0 ||
      !Number.isSafeInteger(config.maxActive) || config.maxActive < 10 || config.maxActive > 100 ||
      !Number.isSafeInteger(config.totalInflux) || config.totalInflux < 0 || config.totalInflux > 1000) {
    throw new RangeError("Population requires nonnegative integer influx, 10–100 active slots and at most 1000 total newcomers.");
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
    shopEconomy: null,
    dungeonFloors: [],
    seed,
    rngState: generated.rngState,
    populationConfig,
    influxRemaining: populationConfig.totalInflux,
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
  const adventurers = state.adventurers.map((hero) => {
    const dungeon = simulateDungeon(hero, day, rngState);
    const shop = scheduleShopVisit(dungeon.adventurer, day, dungeon.rngState);
    rngState = shop.rngState;
    events.push(...dungeon.events, ...shop.events);
    return shop.adventurer;
  });
  const active = adventurers.filter((hero) => hero.status !== "dead").length;
  const influx = Math.min(state.populationConfig.dailyInflux, state.influxRemaining,
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
      ...state, day, adventurers, rngState,
      influxRemaining: state.influxRemaining - influx,
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
