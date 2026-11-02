import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { locationLabel, portraitIndex, rosterEntries } from "../../src/game/rosterView.ts";

test("roster entries show shop visitors first and stable portrait IDs", () => {
  const state = createGameState();
  const active = rosterEntries(state, "active");
  assert.equal(active.length, 10);
  assert(active.slice(0, 3).every((hero) => hero.status === "at-shop"));
  assert.equal(portraitIndex("adventurer-1"), 0);
  assert.equal(portraitIndex("adventurer-25"), 24);
  assert.equal(portraitIndex("adventurer-26"), 0);
  assert.equal(locationLabel(active[0]), "F5 · Shop");
  assert.equal(rosterEntries(state, "fallen").length, 0);
  assert.equal(state.rngState, createGameState().rngState);
});

test("roster read views do not mutate campaign state and remain bounded after long play", () => {
  let state = createGameState();
  for (let day = 0; day < 220; day++) state = advanceDay(state).state;
  const snapshot = structuredClone(state);
  const active = rosterEntries(state, "active");
  const fallen = rosterEntries(state, "fallen");
  assert(active.length <= state.populationConfig.maxActive);
  assert(fallen.length <= 40);
  assert(fallen.every((hero) => hero.status === "dead"));
  assert.deepEqual(state, snapshot);
  assert.deepEqual(rosterEntries(state, "active").map((hero) => hero.id), active.map((hero) => hero.id));
});

test("fallen roster is ordered by latest event before limiting to 40 heroes", () => {
  const state = createGameState();
  const heroes = Array.from({ length: 41 }, (_, index) => ({
    ...state.adventurers[0],
    id: `adventurer-${index + 1}`,
    status: "dead" as const,
  }));
  const deaths = [...heroes.slice(1), heroes[0]].map((hero, index) => ({
    id: `death-${index}`,
    type: "starvation" as const,
    day: index + 1,
    message: `${hero.name} died.`,
    adventurerId: hero.id,
  }));
  const fallen = rosterEntries({ ...state, adventurers: heroes, events: deaths }, "fallen");

  assert.equal(fallen.length, 40);
  assert.equal(fallen[0].id, "adventurer-1");
  assert.equal(fallen.at(-1)?.id, "adventurer-3");
  assert(!fallen.some((hero) => hero.id === "adventurer-2"));
});
