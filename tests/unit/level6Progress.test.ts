import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, createGameState, setLevel6Permit } from "../../src/game/gameState.ts";
import { level6Progress } from "../../src/game/level6Progress.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

test("expedition ledger is derived only from confirmed persisted combat events", () => {
  let state = createGameState();
  assert.deepEqual(level6Progress(state), {
    departures: 0, encounters: 0, victories: 0, retreats: 0,
    deaths: 0, firstClear: false, recent: [],
  });
  const visitor = state.adventurers.find(h => h.status === "at-shop")!;
  state = setLevel6Permit(state, visitor.id, true);
  state = advanceDay(state).state;
  assert.equal(level6Progress(state).departures, 1);
  assert.equal(level6Progress(state).encounters, 0, "no battle on departure day");
  state = advanceDay(state).state;
  const progress = level6Progress(state);
  assert.equal(progress.encounters, 1);
  assert.equal(progress.victories + progress.retreats + progress.deaths, 1);
  assert.equal(progress.recent[0].adventurerId, visitor.id);
  assert.equal(progress.recent[0].day, state.day);
  assert.deepEqual(level6Progress(parseSave(JSON.stringify(createSave(state)))), progress);
  assert.deepEqual(level6Progress(state), progress, "rendering cannot book an extra encounter");
});

test("expedition event ledger remains accurate, bounded and stable over long campaigns", () => {
  let state = createGameState();
  for (let day = 0; day < 130; day++) {
    for (const hero of state.adventurers.filter(h => h.status === "at-shop")) {
      state = setLevel6Permit(state, hero.id, true);
    }
    state = advanceDay(state).state;
    const stats = level6Progress(state);
    assert.equal(stats.encounters, stats.victories + stats.retreats + stats.deaths);
    assert(stats.recent.length <= 20);
    assert.equal(stats.firstClear, state.dungeonFloors.some(f => f.floor === 6 && f.cleared));
  }
  const saved = parseSave(JSON.stringify(createSave(state)));
  assert.deepEqual(level6Progress(saved), level6Progress(state));
  assert.deepEqual(saved, state);
});
