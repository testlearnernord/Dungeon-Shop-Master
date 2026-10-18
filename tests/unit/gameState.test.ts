import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceDay,
  createGameState,
  SIMULATION_VERSION,
  transitionDayConfirmation,
} from "../../src/game/gameState.ts";

test("a fresh session starts on Day 1 with independent state and a welcome event", () => {
  const state = createGameState();
  assert.equal(state.day, 1);
  assert.equal(state.simulationVersion, SIMULATION_VERSION);
  assert.deepEqual(state.events, [
    { type: "welcome", day: 1, message: "Welcome to Day 1. The shop is ready." },
  ]);
  assert.deepEqual(state.adventurers, []);
  assert.equal(state.shopEconomy, null);
  assert.deepEqual(state.dungeonFloors, []);
  assert.deepEqual(state.hunger, []);
  assert.notEqual(state.events, createGameState().events);
});

test("one tick advances exactly one day and returns only that tick's deterministic events", () => {
  const initial = createGameState();
  const result = advanceDay(initial);
  assert.equal(result.state.day, 2);
  assert.deepEqual(result.events, [{ type: "day-started", day: 2, message: "Day 2 begins." }]);
  assert.deepEqual(result.state.events, [...initial.events, ...result.events]);
  assert.deepEqual(advanceDay(initial), result);
});

test("ticks do not mutate frozen input, history, or future system state", () => {
  const initial = {
    ...createGameState(),
    adventurers: [{ id: "test-adventurer" }],
    shopEconomy: { balance: 17 },
    dungeonFloors: [{ floor: 1, cleared: false }],
    hunger: [{ adventurerId: "test-adventurer", hunger: 4 }],
  };
  const snapshot = structuredClone(initial);
  for (const value of [initial.events, initial.adventurers, initial.dungeonFloors, initial.hunger]) {
    value.forEach(Object.freeze);
    Object.freeze(value);
  }
  Object.freeze(initial.shopEconomy);
  Object.freeze(initial);
  const { state } = advanceDay(initial);
  assert.deepEqual(initial, snapshot);
  assert.notEqual(state, initial);
  assert.notEqual(state.events, initial.events);
  for (const key of ["adventurers", "shopEconomy", "dungeonFloors", "hunger"] as const) {
    assert.deepEqual(state[key], snapshot[key]);
  }
});

test("ten consecutive ticks preserve ordered history and version", () => {
  let state = createGameState();
  for (let tick = 1; tick <= 10; tick += 1) {
    state = advanceDay(state).state;
    assert.equal(state.day, tick + 1);
    assert.equal(state.events.length, tick + 1);
    assert.equal(state.simulationVersion, SIMULATION_VERSION);
    assert.equal(state.events.at(-1)?.day, state.day);
  }
});

test("invalid days and unsupported versions fail without modifying state", () => {
  for (const day of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    const state = { ...createGameState(), day };
    const snapshot = structuredClone(state);
    assert.throws(() => advanceDay(state), RangeError);
    assert.deepEqual(state, snapshot);
  }
  assert.throws(() => advanceDay({ ...createGameState(), simulationVersion: 0 }), RangeError);
});

test("requests, cancellation and duplicate confirmation never advance without a pending request", () => {
  assert.deepEqual(transitionDayConfirmation(false, "confirm"), { pending: false, advance: false });
  assert.deepEqual(transitionDayConfirmation(false, "cancel"), { pending: false, advance: false });
  const request = transitionDayConfirmation(false, "request");
  assert.deepEqual(request, { pending: true, advance: false });
  assert.deepEqual(transitionDayConfirmation(request.pending, "request"), request);
  const cancelled = transitionDayConfirmation(request.pending, "cancel");
  assert.deepEqual(cancelled, { pending: false, advance: false });
  assert.equal(transitionDayConfirmation(cancelled.pending, "confirm").advance, false);
  const confirmed = transitionDayConfirmation(request.pending, "confirm");
  assert.deepEqual(confirmed, { pending: false, advance: true });
  assert.equal(transitionDayConfirmation(confirmed.pending, "confirm").advance, false);
});
