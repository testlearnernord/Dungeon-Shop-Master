import assert from "node:assert/strict";
import test from "node:test";
import { heroDisplayNames, heroPortraitIndex } from "../../src/game/heroIdentity.ts";
import { createGameState, advanceDay } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

test("duplicate display names remain unique across active and fallen history without modifying saves", () => {
  const original = createGameState();
  const base = original.adventurers[0];
  const history = [
    { ...base, id: "adventurer-1", name: "Iris Stone", status: "dead" as const },
    { ...base, id: "adventurer-2", name: "Iris Stone", status: "at-shop" as const },
    { ...base, id: "adventurer-25", name: "Iris Stone", status: "exploring" as const },
    { ...base, id: "adventurer-26", name: "Hale Vale", status: "exploring" as const },
  ];
  const state = { ...original, adventurers: history };
  const before = structuredClone(state);
  const labels = heroDisplayNames(state.adventurers);
  assert.equal(labels.get("adventurer-1"), "Iris Stone");
  assert.equal(labels.get("adventurer-2"), "Iris Stone #2");
  assert.equal(labels.get("adventurer-25"), "Iris Stone #3");
  assert.equal(labels.get("adventurer-26"), "Hale Vale");
  assert.deepEqual(state, before);
  const later = [...history, { ...base, id: "adventurer-37", name: "Iris Stone" }];
  assert.equal(heroDisplayNames(later).get("adventurer-2"), "Iris Stone #2");
  assert.equal(heroDisplayNames(later).get("adventurer-37"), "Iris Stone #4");
  assert.equal(heroDisplayNames([...later].reverse()).get("adventurer-2"), "Iris Stone #2");
  assert.equal(heroPortraitIndex("adventurer-1"), 0);
  assert.equal(heroPortraitIndex("adventurer-25"), 24);
  assert.equal(heroPortraitIndex("adventurer-26"), 0);
});

test("display identity is deterministic across long campaigns and save reload", () => {
  let state = createGameState();
  for (let i = 0; i < 100; i++) state = advanceDay(state).state;
  const original = heroDisplayNames(state.adventurers);
  const loaded = parseSave(JSON.stringify(createSave(state)));
  assert.deepEqual(heroDisplayNames(loaded.adventurers), original);
  assert.equal(new Set(original.values()).size, original.size);
  assert.deepEqual(loaded, state);
});
