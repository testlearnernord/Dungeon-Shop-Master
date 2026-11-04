import { consumeDailySupplies, generateAdventurer, generateStartingPopulation, type AdventurerState } from "./adventurers.ts";
import { createEconomy, tradeAtStartOfDay, type ItemId, type Slot } from "./economy.ts";
import { simulateDungeon, type DungeonOutcome } from "./dungeonSimulation.ts";
import { simulateLevel6Combat } from "./level6Combat.ts";
import type { BossCombatReplay } from "./bossCombatReplay.ts";
import { REPLAY_KEEP_RECENT } from "./bossCombatReplay.ts";
import {
  emptyLevel7World, LEVEL7_REPLAY_KEEP, simulateLevel7Day,
  type Level7Replay, type Level7World,
} from "./level7Exploration.ts";
import { forageAfterEncounter } from "./foraging.ts";
import { ECONOMY } from "./economy.ts";
import { DEFAULT_SEED, SeededRandom } from "./random.ts";
import { createShopLayout, type ShopLayout } from "./shopLayout.ts";
import { settleHeldShopCarts, type ShopCart } from "./shopCarts.ts";
import { arrivalEvent, scheduleShopVisit } from "./shopArrivals.ts";

export type { AdventurerState } from "./adventurers.ts";
export const SIMULATION_VERSION = 10;

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
    "sale" | "ate" | "healed" | "starvation" | "rescue" |
    "level6-departure" | "level6-combat" | "level6-return" | "food-shortage" | "found-food" |
    "level7-departure" | "level7-exploration";
  readonly day: number;
  readonly message: string;
  readonly adventurerId?: string;
  readonly outcome?: DungeonOutcome;
  readonly combatOutcome?: "victory" | "retreat" | "death";
  /** Exact replay of the committed fixed-step combat. Older events omit this. */
  readonly combatReplay?: BossCombatReplay;
  /** Committed path and battles of one Level 7 day. */
  readonly level7Replay?: Level7Replay;
  readonly itemId?: ItemId;
  readonly quantity?: number;
  readonly revenue?: number;
  /** Manual cash register vs. automated settlement; absent means legacy auto sale. */
  readonly saleChannel?: "manual" | "reserved";
}

export interface GameState {
  readonly day: number;
  readonly simulationVersion: number;
  readonly events: readonly WorldEvent[];
  readonly adventurers: readonly AdventurerState[];
  readonly shopEconomy: ShopEconomyState;
  readonly shopLayout: ShopLayout;
  readonly shopCarts: readonly ShopCart[];
  readonly dungeonFloors: readonly DungeonFloorProgress[];
  readonly level7World: Level7World;
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
    shopLayout: createShopLayout(),
    shopCarts: [],
    dungeonFloors: [],
    level7World: emptyLevel7World(),
    seed,
    rngState: generated.rngState,
    populationConfig,
    nextAdventurerId: 11,
  };
}

/**
 * Count a missed opportunity only at a real departure, once per shop visit.
 * The meal may have been purchased and consumed during this same global tick.
 */
function recordFoodShopDeparture(
  hero: AdventurerState, day: number, hadFood: boolean, events: WorldEvent[],
): AdventurerState {
  if (hadFood) return { ...hero, missedFoodShopVisits: 0 };
  const failures = Math.min(ECONOMY.missedFoodShopsBeforeStarvation, hero.missedFoodShopVisits + 1);
  events.push({
    id: `day-${day}:${hero.id}:food-shortage`, type: "food-shortage",
    day, adventurerId: hero.id,
    message: `${hero.name} left the shop without food (${failures}/${ECONOMY.missedFoodShopsBeforeStarvation} failed food visits).`,
  });
  return { ...hero, missedFoodShopVisits: failures };
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
  // Transitional settlement: picked goods were physically reserved during the
  // previous shop day. Book them once before supplies/departures, but keep
  // automatic legacy trading for heroes without reserved carts.
  const settlement = settleHeldShopCarts(state, day);
  const paidIds = new Set<string>(settlement.settledIds);
  for (const event of state.events) {
    if (event.type === "sale" && event.saleChannel === "manual" &&
        event.day === state.day && event.adventurerId)
      paidIds.add(event.adventurerId);
  }
  const tradeProjection = {
    ...settlement.state,
    adventurers: settlement.state.adventurers.map(hero => paidIds.has(hero.id)
      ? {...hero, status: "returning" as const, floor: 4 as const,
          shopStayDays: 0}
      : hero),
  };
  const trade = tradeAtStartOfDay(tradeProjection, day);
  const settledHeroes = new Map(settlement.state.adventurers.map(hero => [hero.id,hero]));
  const postTradeHeroes = trade.adventurers.map(hero => paidIds.has(hero.id)
    ? settledHeroes.get(hero.id)! : hero);
  events.push(...settlement.events, ...trade.events);
  let clearedLevel6 = state.dungeonFloors.some((entry) => entry.floor === 6 && entry.cleared);
  const level7UnlockedAtStart = clearedLevel6;
  let clearedLevel7 = state.dungeonFloors.some((entry) => entry.floor === 7 && entry.cleared);
  let level7World = state.level7World;
  const adventurers = postTradeHeroes.map((hero) => {
    // Exactly one action per hero per global tick. Purchases precede supplies,
    // and newly authorized departures cannot fight on their departure day.
    const supplies = consumeDailySupplies(hero, day);
    events.push(...supplies.events);
    const ready = supplies.adventurer;
    if (ready.status === "expedition" && ready.floor === 7) {
      const exploration = simulateLevel7Day(ready, level7World, state.seed, day);
      level7World = exploration.world;
      if (exploration.replay.outcome === "completed") clearedLevel7 = true;
      events.push({
        id: `day-${day}:${ready.id}:level7-exploration`,
        type: "level7-exploration", day, adventurerId: ready.id,
        level7Replay: exploration.replay,
        message: `${ready.name}'s Level 7 expedition was recorded. Watch the saved footage to discover what happened.`,
      });
      return exploration.adventurer;
    }
    if (ready.status === "expedition" && ready.floor === 6) {
      const combat = simulateLevel6Combat(ready, day, rngState);
      rngState = combat.rngState;
      events.push(...combat.events);
      if (combat.victory) clearedLevel6 = true;
      if (!combat.victory) return combat.adventurer;
      const found = forageAfterEncounter(combat.adventurer, day, rngState);
      rngState = found.rngState;
      events.push(...found.events);
      return found.adventurer;
    }
    if (ready.status === "at-shop" && ready.level6Permit && ready.health > 0 &&
        level7UnlockedAtStart && !clearedLevel7) {
      events.push({
        id: `day-${day}:${ready.id}:level7-departure`, type: "level7-departure",
        day, adventurerId: ready.id,
        message: `${ready.name} entered the unexplored Level 7 from the shop.`,
      });
      const departing = recordFoodShopDeparture(ready, day, hero.inventory.food > 0, events);
      return { ...departing, status: "expedition" as const, floor: 7 as const, shopStayDays: 0 };
    }
    if (ready.status === "at-shop" && ready.level6Permit && ready.health > 0 &&
        !level7UnlockedAtStart) {
      events.push({
        id: `day-${day}:${ready.id}:level6-departure`, type: "level6-departure",
        day, adventurerId: ready.id, message: `${ready.name} entered Level 6 with the merchant's permission.`,
      });
      const departing = recordFoodShopDeparture(ready, day, hero.inventory.food > 0, events);
      return { ...departing, status: "expedition" as const, floor: 6 as const, shopStayDays: 0 };
    }
    const dungeon = simulateDungeon(ready, day, rngState);
    const found = dungeon.events.some((event) => event.type === "dungeon-outcome") &&
      dungeon.adventurer.status !== "dead"
      ? forageAfterEncounter(dungeon.adventurer, day, dungeon.rngState)
      : { adventurer: dungeon.adventurer, events: [] as readonly WorldEvent[], rngState: dungeon.rngState };
    const shop = scheduleShopVisit(found.adventurer, day, found.rngState);
    rngState = shop.rngState;
    events.push(...dungeon.events, ...found.events, ...shop.events);
    // One missed opportunity per COMPLETED visit, not per day in the shop.
    // Purchases are booked before meals and departures; a bought meal consumed
    // on this very day counts as successful access to food.
    if (ready.status === "at-shop" && shop.adventurer.status === "returning") {
      return recordFoodShopDeparture(shop.adventurer, day, hero.inventory.food > 0, events);
    }
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
  // Keep the full event history, but only a few heavy 3D recordings.
  // Removing an expired replay never changes its outcome/event/hero/RNG.
  const allEvents = [...state.events, ...events];
  const keepBoss = new Set(allEvents.filter(event =>
    event.type === "level6-combat" && event.combatReplay)
    .slice(-REPLAY_KEEP_RECENT).map(event => event.id));
  const keepDungeon = new Set(allEvents.filter(event =>
    event.type === "level7-exploration" && event.level7Replay)
    .slice(-LEVEL7_REPLAY_KEEP).map(event => event.id));
  const compactedEvents = allEvents.map(event => {
    if ((!event.combatReplay || keepBoss.has(event.id)) &&
        (!event.level7Replay || keepDungeon.has(event.id))) return event;
    const {
      combatReplay: _expiredBoss, level7Replay: _expiredDungeon,
      ...smallEvent
    } = event;
    return {...smallEvent,
      ...(event.combatReplay && keepBoss.has(event.id) ? {combatReplay:event.combatReplay}:{ }),
      ...(event.level7Replay && keepDungeon.has(event.id) ? {level7Replay:event.level7Replay}:{ }),
    };
  });
  return {
    state: {
      ...settlement.state, day, adventurers, rngState, shopEconomy: trade.economy,
      level7World,
      dungeonFloors: [
        ...state.dungeonFloors,
        ...(clearedLevel6 && !state.dungeonFloors.some(f=>f.floor===6&&f.cleared)
          ? [{floor:6,cleared:true}]:[]),
        ...(clearedLevel7 && !state.dungeonFloors.some(f=>f.floor===7&&f.cleared)
          ? [{floor:7,cleared:true}]:[]),
      ],
      nextAdventurerId: state.nextAdventurerId + influx,
      events: compactedEvents,
    },
    events,
  };
}

/**
 * Grant or revoke Level 6 access only while a living hero is visiting the shop.
 * This is an explicit player decision, not a tick or a hidden RNG roll.
 * The Level 6 expedition system consumes this flag when a visitor departs.
 */
export function setLevel6Permit(state: GameState, heroId: string, permitted: boolean): GameState {
  if (typeof permitted !== "boolean") throw new TypeError("Level 6 permission must be boolean.");
  const hero = state.adventurers.find((entry) => entry.id === heroId);
  if (!hero || hero.status !== "at-shop" || hero.health <= 0 || hero.level6Permit === permitted) return state;
  return {
    ...state,
    adventurers: state.adventurers.map((entry) =>
      entry.id === heroId ? { ...entry, level6Permit: permitted } : entry),
  };
}

export type DayAction = "request" | "confirm" | "cancel";

export function transitionDayConfirmation(pending: boolean, action: DayAction) {
  return {
    pending: action === "request",
    advance: pending && action === "confirm",
  };
}
