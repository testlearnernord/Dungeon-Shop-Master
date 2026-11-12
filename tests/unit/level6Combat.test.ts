import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, setLevel6Permit, type GameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { simulateLevel6Combat } from "../../src/game/level6Combat.ts";
import type { AdventurerState } from "../../src/game/adventurers.ts";

test("only authorized living shop visitors enter Level 6, with no combat on departure", () => {
  const initial = createGameState(7351);
  const id = initial.adventurers[0].id;
  const second = initial.adventurers[1].id;
  let s = setLevel6Permit(initial, id, true);
  s = advanceDay(s).state;
  assert.equal(s.adventurers.find(h=>h.id===id)?.status, "expedition");
  assert.equal(s.adventurers.find(h=>h.id===id)?.floor, 6);
  assert.equal(s.adventurers.find(h=>h.id===second)?.level6Permit, false);
  assert.equal(s.events.filter(e=>e.adventurerId===id && e.type==="level6-combat").length, 0);
  assert.equal(s.events.filter(e=>e.adventurerId===id && e.type==="level6-departure").length, 1);
  assert.equal(s.day, 2);
  const before = setLevel6Permit(initial, id, true);
  assert.equal(setLevel6Permit(before, id, false).adventurers.find(h=>h.id===id)?.level6Permit, false);
  assert.notEqual(advanceDay(setLevel6Permit(before, id, false)).state.adventurers.find(h=>h.id===id)?.status, "expedition");
});

test("combat resolves once per tick, survives save/reload and preserves economy", () => {
  let s = setLevel6Permit(createGameState(7351), "adventurer-1", true);
  s = advanceDay(s).state;
  const pending = parseSave(JSON.stringify(createSave(s)));
  const uninterrupted = advanceDay(s).state;
  const resumed = advanceDay(pending).state;
  assert.deepEqual(resumed, uninterrupted);
  const hero = resumed.adventurers.find(h=>h.id==="adventurer-1")!;
  assert.notEqual(hero.status,"expedition");
  assert(["dead","traveling"].includes(hero.status));
  assert.equal(resumed.events.filter(e=>e.day===3 && e.adventurerId===hero.id && e.type==="level6-combat").length, 1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(resumed))),resumed);
  assert.equal(resumed.shopEconomy.balance >= 0, true);
  if(hero.status==="traveling") {
    const arrived = advanceDay(resumed).state.adventurers.find(h=>h.id===hero.id)!;
    assert.equal(arrived.status, "at-shop");
    assert.equal(arrived.floor, 5);
    assert.equal(arrived.level6Permit, true);
  }
});

test("victories unlock floor 6 once, deaths remain final, no route to floor 7", () => {
  let s = createGameState();
  const id = s.adventurers[0].id;
  const strong: AdventurerState = { ...s.adventurers[0], health:100, stats:{strength:80,agility:80,intellect:10,maxHealth:100},status:"expedition",floor:6,level6Permit:true };
  s = {...s,adventurers:s.adventurers.map(h=>h.id===id?strong:h)};
  const winner = advanceDay(s).state;
  assert.equal(winner.dungeonFloors.filter(f=>f.floor===6 && f.cleared).length,1);
  assert.equal(winner.events.find(e=>e.day===2 && e.adventurerId===id && e.type==="level6-combat")?.combatOutcome,"victory");
  assert(winner.adventurers.every(h=>h.floor<=6));
  const dead = {...strong,health:1,stats:{...strong.stats,strength:1,agility:1}};
  const victim = simulateLevel6Combat(dead,2,42);
  assert(victim.adventurer.status==="dead" || victim.adventurer.status==="traveling");
  if(victim.adventurer.status==="dead") {
    assert.equal(simulateLevel6Combat(victim.adventurer,3,victim.rngState).adventurer,victim.adventurer);
  }
});

test("strict v4 campaign migration retains previous permits and rejects forged older events", () => {
  let s = setLevel6Permit(createGameState(), "adventurer-1", true);
  s = advanceDay(s).state;
  // A real v4-era save has never entered Level 6, so use a v5 starting state with explicit permit.
  const old = createGameState() as GameState;
  const version4: any = createSave(old);
  version4.simulationVersion=4;
  version4.payload.simulationVersion=4;
  delete version4.payload.level7World;
  delete version4.payload.shopLayout;
  delete version4.payload.shopCarts;
  delete version4.payload.shopDebts;
  version4.payload.adventurers[0].level6Permit=true;
  for (const hero of version4.payload.adventurers) delete hero.missedFoodShopVisits;
  delete version4.payload.shopEconomy.bag["iron-sword"];
  delete version4.payload.shopEconomy.bag["leather-vest"];
  const upgraded=parseSave(JSON.stringify(version4));
  assert.equal(upgraded.simulationVersion,11);
  assert.equal(upgraded.adventurers[0].level6Permit,true);
  assert.equal(upgraded.rngState,old.rngState);
  assert.deepEqual(upgraded.shopEconomy,old.shopEconomy);
  const corrupted=structuredClone(version4);
  corrupted.payload.events[0].type="level6-combat";
  assert.throws(()=>parseSave(JSON.stringify(corrupted)),/type/);
});
