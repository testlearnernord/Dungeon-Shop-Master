export const SIMULATION_VERSION = 1;

// Extension points only; these systems do not run during a tick yet.
export interface AdventurerState {
  readonly id: string;
}

export interface ShopEconomyState {
  readonly balance: number;
}

export interface DungeonFloorProgress {
  readonly floor: number;
  readonly cleared: boolean;
}

export interface HungerState {
  readonly adventurerId: string;
  readonly hunger: number;
}

export interface WorldEvent {
  readonly type: "welcome" | "day-started";
  readonly day: number;
  readonly message: string;
}

export interface GameState {
  readonly day: number;
  readonly simulationVersion: number;
  readonly events: readonly WorldEvent[];
  readonly adventurers: readonly AdventurerState[];
  readonly shopEconomy: ShopEconomyState | null;
  readonly dungeonFloors: readonly DungeonFloorProgress[];
  readonly hunger: readonly HungerState[];
}

export function createGameState(): GameState {
  return {
    day: 1,
    simulationVersion: SIMULATION_VERSION,
    events: [{ type: "welcome", day: 1, message: "Welcome to Day 1. The shop is ready." }],
    adventurers: [],
    shopEconomy: null,
    dungeonFloors: [],
    hunger: [],
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
  const events: readonly WorldEvent[] = [{ type: "day-started", day, message: `Day ${day} begins.` }];
  return { state: { ...state, day, events: [...state.events, ...events] }, events };
}

export type DayAction = "request" | "confirm" | "cancel";

export function transitionDayConfirmation(pending: boolean, action: DayAction) {
  return {
    pending: action === "request",
    advance: pending && action === "confirm",
  };
}
