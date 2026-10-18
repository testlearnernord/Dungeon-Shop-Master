import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../../src/game/gameState.ts";
import { GameStore } from "../../src/game/gameStore.ts";

test("store processes a purchase request ID once without duplicate gold, items or notifications", () => {
  const initial = createGameState();
  const snapshot = structuredClone(initial);
  const store = new GameStore(initial);
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  assert.match(store.purchase("bread", 2, 100), /^Bought/);
  const purchased = store.state;
  assert.equal(purchased.shopEconomy.bag.bread, initial.shopEconomy.bag.bread + 2);
  assert.equal(purchased.shopEconomy.balance, initial.shopEconomy.balance - 4);
  assert.equal(notifications, 1);
  assert.match(store.purchase("bread", 2, 100), /already processed/);
  assert.equal(store.state, purchased);
  assert.equal(notifications, 1);
  assert.deepEqual(initial, snapshot);
});

test("rejected store purchases preserve state identity and never notify subscribers", () => {
  const initial = createGameState();
  const snapshot = structuredClone(initial);
  const store = new GameStore(initial);
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  assert.match(store.purchase("bread", 100, 1), /Not enough gold/);
  assert.match(store.purchase("bread", 0, 2), /positive whole quantity/);
  assert.match(store.purchase("bread", 100, 1), /already processed/);
  assert.equal(store.state, initial);
  assert.deepEqual(store.state, snapshot);
  assert.equal(notifications, 0);
});

test("one store endDay call advances exactly once and publishes one fully resolved state", () => {
  const initial = createGameState();
  const snapshot = structuredClone(initial);
  const store = new GameStore(initial);
  const observed: number[] = [];
  const unsubscribe = store.subscribe(() => { observed.push(store.state.day); });
  store.endDay();
  assert.equal(store.state.day, initial.day + 1);
  assert.equal(store.state.shopEconomy.dailySales.day, initial.day + 1);
  assert.deepEqual(observed, [2]);
  assert.equal(store.state.events.filter((event) => event.type === "day-started").length, 1);
  assert.deepEqual(initial, snapshot);
  unsubscribe();
  store.endDay();
  assert.equal(store.state.day, 3);
  assert.deepEqual(observed, [2]);
});

test("store shelf transfers notify only on success and share the authoritative economy", () => {
  const store = new GameStore();
  const initial = store.state;
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  assert.match(store.transfer("shelf-1-slot-1", "healing-herb", "stock"), /^Placed/);
  assert.equal(store.state.shopEconomy.bag["healing-herb"], initial.shopEconomy.bag["healing-herb"] - 1);
  assert.equal(store.state.shopEconomy.slots[0].quantity, 1);
  assert.equal(notifications, 1);
  const stocked = store.state;
  store.transfer("shelf-1-slot-1", "bread", "stock");
  assert.equal(store.state, stocked);
  assert.equal(notifications, 1);
  assert.match(store.transfer("shelf-1-slot-1", "healing-herb", "remove"), /^Returned/);
  assert.deepEqual(store.state, initial);
  assert.equal(notifications, 2);
});
