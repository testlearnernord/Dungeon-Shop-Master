import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, setBossPass, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";

test("Boss Pass is explicit, individual, immutable and does not consume a tick", () => {
  const initial = createGameState();
  assert.equal(SIMULATION_VERSION, 33);
  assert(initial.adventurers.every((hero) => !hero.bossPass));
  const visitor = initial.adventurers[0];
  const granted = setBossPass(initial, visitor.id, true);
  assert.notEqual(granted, initial);
  assert.equal(granted.adventurers[0].bossPass, true);
  assert.equal(initial.adventurers[0].bossPass, false);
  assert(granted.adventurers.slice(1).every((hero) => !hero.bossPass));
  assert.equal(granted.day, initial.day);
  assert.equal(granted.rngState, initial.rngState);
  assert.equal(granted.events, initial.events);
  assert.equal(setBossPass(granted, visitor.id, true), granted);
  assert.equal(setBossPass(granted, "missing", true), granted);
  assert.equal(setBossPass(granted, initial.adventurers[4].id, true), granted);
  assert.throws(() => setBossPass(granted, visitor.id, "yes" as any), TypeError);
  assert.equal(setBossPass(granted, visitor.id, false).adventurers[0].bossPass, false);
});

test("permissions survive future days, save roundtrips and GameStore restore", () => {
  const store = new GameStore(createGameState());
  const id = store.state.adventurers[0].id;
  let emissions = 0;
  store.subscribe(() => { emissions += 1; });
  assert.equal(store.setBossPass(id, true), true);
  assert.equal(store.setBossPass(id, true), false);
  assert.equal(emissions, 1);
  const saved = parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(saved.adventurers[0].bossPass, true);
  store.restore(saved);
  const next = advanceDay(store.state).state;
  assert.equal(next.adventurers.find((h) => h.id === id)?.bossPass, true);
});

test("current payloads reject missing and wrongly typed permit values", () => {
  const normal = createSave(createGameState());
  const missing = structuredClone(normal) as any;
  delete missing.payload.adventurers[0].bossPass;
  assert.throws(() => parseSave(JSON.stringify(missing)), /bossPass/);
  const malformed = structuredClone(normal) as any;
  malformed.payload.adventurers[0].bossPass = "yes";
  assert.throws(() => parseSave(JSON.stringify(malformed)), /bossPass/);
});