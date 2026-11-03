import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, setLevel6Permit, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";

test("Level 6 permission is explicit, individual, immutable and does not consume a tick", () => {
  const initial = createGameState();
  assert.equal(SIMULATION_VERSION, 7);
  assert(initial.adventurers.every((hero) => !hero.level6Permit));
  const visitor = initial.adventurers[0];
  const granted = setLevel6Permit(initial, visitor.id, true);
  assert.notEqual(granted, initial);
  assert.equal(granted.adventurers[0].level6Permit, true);
  assert.equal(initial.adventurers[0].level6Permit, false);
  assert(granted.adventurers.slice(1).every((hero) => !hero.level6Permit));
  assert.equal(granted.day, initial.day);
  assert.equal(granted.rngState, initial.rngState);
  assert.equal(granted.events, initial.events);
  assert.equal(setLevel6Permit(granted, visitor.id, true), granted);
  assert.equal(setLevel6Permit(granted, "missing", true), granted);
  assert.equal(setLevel6Permit(granted, initial.adventurers[4].id, true), granted);
  assert.throws(() => setLevel6Permit(granted, visitor.id, "yes" as any), TypeError);
  assert.equal(setLevel6Permit(granted, visitor.id, false).adventurers[0].level6Permit, false);
});

test("permissions survive future days, save roundtrips and GameStore restore", () => {
  const store = new GameStore(createGameState());
  const id = store.state.adventurers[0].id;
  let emissions = 0;
  store.subscribe(() => { emissions += 1; });
  assert.equal(store.setLevel6Permit(id, true), true);
  assert.equal(store.setLevel6Permit(id, true), false);
  assert.equal(emissions, 1);
  const saved = parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(saved.adventurers[0].level6Permit, true);
  store.restore(saved);
  const next = advanceDay(store.state).state;
  assert.equal(next.adventurers.find((h) => h.id === id)?.level6Permit, true);
});

test("old v3 save migrates exactly once without modifying RNG, hero history or merchant state", () => {
  // Reconstruct a genuine pre-foraging v3 state, without v6-only events.
  const current = createGameState();
  const old = structuredClone(current) as any;
  old.simulationVersion = 3;
  delete old.shopEconomy.bag["iron-sword"];
  delete old.shopEconomy.bag["leather-vest"];
  for (const hero of old.adventurers) {
    delete hero.level6Permit;
    delete hero.missedFoodShopVisits;
  }
  const oldEnvelope: any = createSave(current);
  oldEnvelope.simulationVersion = 3;
  oldEnvelope.payload = old;
  const before = JSON.stringify(oldEnvelope);
  const migrated = parseSave(before);
  assert.equal(migrated.simulationVersion, 7);
  assert.equal(migrated.day, current.day);
  assert.equal(migrated.rngState, current.rngState);
  assert.deepEqual(migrated.events, current.events);
  assert.deepEqual(migrated.shopEconomy, current.shopEconomy);
  assert(migrated.adventurers.every((hero) => hero.level6Permit === false));
  assert.deepEqual(migrated, current);
  assert.deepEqual(parseSave(JSON.stringify(createSave(migrated))), migrated);
  assert.equal(JSON.stringify(oldEnvelope), before);
  const corrupt = JSON.parse(before);
  corrupt.payload.shopEconomy.balance = -2;
  assert.throws(() => parseSave(JSON.stringify(corrupt)), /balance/);
  const future = JSON.parse(before);
  future.simulationVersion = 99;
  assert.throws(() => parseSave(JSON.stringify(future)), /incompatible/);
});

test("v6 payloads reject missing and wrongly typed permit values", () => {
  const normal = createSave(createGameState());
  const missing = structuredClone(normal) as any;
  delete missing.payload.adventurers[0].level6Permit;
  assert.throws(() => parseSave(JSON.stringify(missing)), /level6Permit/);
  const malformed = structuredClone(normal) as any;
  malformed.payload.adventurers[0].level6Permit = "yes";
  assert.throws(() => parseSave(JSON.stringify(malformed)), /level6Permit/);
});