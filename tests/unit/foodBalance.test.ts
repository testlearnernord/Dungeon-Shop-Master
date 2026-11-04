import assert from "node:assert/strict";
import test from "node:test";
import { consumeDailySupplies, generateAdventurer } from "../../src/game/adventurers.ts";
import { ECONOMY } from "../../src/game/economy.ts";
import { forageAfterEncounter } from "../../src/game/foraging.ts";
import { advanceDay, createGameState, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { scheduleShopVisit } from "../../src/game/shopArrivals.ts";

test("one missed meal or one missed shop visit does not cause starvation damage", () => {
  const hero = { ...generateAdventurer(1, 42).adventurer, hunger: 12, health: 12, missedFoodShopVisits: 1 };
  const result = consumeDailySupplies(hero, 2);
  assert.equal(result.adventurer.health, 12);
  assert.equal(result.adventurer.hunger, 13);
  assert.equal(result.adventurer.missedFoodShopVisits, 1);
  assert.equal(result.events.filter(e => e.type === "starvation").length, 0);
  const fed = consumeDailySupplies({
    ...hero, missedFoodShopVisits: 3, inventory: { ...hero.inventory, food: 1 },
  }, 2);
  assert.equal(fed.adventurer.missedFoodShopVisits, 0);
  assert.equal(fed.adventurer.hunger, 9);
  assert.equal(fed.adventurer.health, 12);
  assert(fed.events.some(e => e.type === "ate"));
  assert(!fed.events.some(e => e.type === "starvation"));
});

test("an extra day in the same shop counts as ONE missed visit on departure", () => {
  const hero = {
    ...generateAdventurer(1, 42).adventurer, status: "at-shop" as const, floor: 5 as const,
    hunger: 7, health: 30, missedFoodShopVisits: 0,
  };
  const base = createGameState();
  const state = {
    ...base, adventurers: [hero],
    populationConfig: { dailyInflux: 0, maxActive: 10 },
    shopEconomy: { ...base.shopEconomy,
      slots: base.shopEconomy.slots.map(slot => ({...slot, itemId: null, quantity: 0})) },
  };
  // Seed 1 yields a shop stay, so the counter must NOT increment yet.
  const stay = scheduleShopVisit(hero, 2, 1);
  assert.equal(stay.adventurer.status, "at-shop");
  const tick = advanceDay({...state, rngState: 1});
  assert.equal(tick.state.adventurers[0].status, "at-shop");
  assert.equal(tick.state.adventurers[0].missedFoodShopVisits, 0);
  assert(!tick.events.some(e => e.type === "food-shortage"));
  const exit = advanceDay(tick.state);
  assert.equal(exit.state.adventurers[0].status, "returning");
  assert.equal(exit.state.adventurers[0].missedFoodShopVisits, 1);
  assert.equal(exit.events.filter(e => e.type === "food-shortage").length, 1);
  assert(!exit.events.some(e => e.type === "starvation"));
});

test("three separate foodless shop departures are needed before starvation damage", () => {
  const base = createGameState();
  const first = { ...base.adventurers[0], health: 35, hunger: 6, shopStayDays: 1,
    missedFoodShopVisits: 0 };
  let state = {
    ...base, adventurers: [first], populationConfig: { dailyInflux: 0, maxActive: 10 },
    shopEconomy: { ...base.shopEconomy,
      slots: base.shopEconomy.slots.map(slot => ({...slot, itemId: null, quantity: 0})) },
  };
  for (let missed = 1; missed <= 3; missed++) {
    const tick = advanceDay(state);
    const next = tick.state.adventurers[0];
    assert.equal(next.missedFoodShopVisits, missed);
    assert.equal(next.health, 35, "no starvation while fewer than 3 shop trips have failed");
    assert.equal(tick.events.filter(e => e.type === "food-shortage").length, 1);
    assert.equal(tick.events.filter(e => e.type === "starvation").length, 0);
    state = {...tick.state, adventurers: [{...next, status: "at-shop" as const, floor: 5 as const, shopStayDays: 1 }]};
  }
  const next = advanceDay(state);
  const hero = next.state.adventurers[0];
  assert.equal(hero.health, 35 - ECONOMY.starvationDamage);
  assert(next.events.some(e=>e.type==="starvation"));
  assert.equal(hero.missedFoodShopVisits, 3);
});

test("found rations have seeded ~25% chance, no duplicate grants or free food while dead", () => {
  const hero = { ...generateAdventurer(1, 777).adventurer, status: "exploring" as const, floor: 3 as const };
  let discoveries = 0;
  for (let seed = 0; seed < 1000; seed += 1) {
    // Spread deterministic seed values over the 32-bit domain, not the
    // correlated adjacent states of the first LCG step.
    const streamSeed = Math.imul(seed, 0x9e3779b9) >>> 0;
    const result = forageAfterEncounter(hero, 2, streamSeed);
    assert.deepEqual(result, forageAfterEncounter(hero, 2, streamSeed));
    assert(result.events.length <= 1);
    if (result.events.length) {
      discoveries += 1;
      assert.equal(result.events[0].type, "found-food");
      assert.equal(result.events[0].itemId, "bread");
      assert.equal(result.adventurer.inventory.food, 1);
      assert.equal(result.events[0].quantity, 1);
    } else assert.equal(result.adventurer.inventory.food, 0);
  }
  assert(discoveries > 150 && discoveries < 350, "seeded discoverability should be meaningfully nonzero, not guaranteed");
  const full = {...hero, inventory: {...hero.inventory, food: ECONOMY.dungeonFoodCarryCap }};
  assert.deepEqual(forageAfterEncounter(full, 2, 123), {
    adventurer: full, events: [], rngState: 123,
  });
  const dead = {...hero, status: "dead" as const, health: 0};
  assert.deepEqual(forageAfterEncounter(dead, 2, 123), {
    adventurer: dead, events: [], rngState: 123,
  });
});

test("version 5 saves migrate strictly to the current version without changing historical state", () => {
  assert.equal(SIMULATION_VERSION, 9);
  const state = createGameState();
  const old = structuredClone(createSave(state)) as any;
  old.simulationVersion = 5;
  old.payload.simulationVersion = 5;
  delete old.payload.level7World;
  delete old.payload.shopLayout;
  for (const hero of old.payload.adventurers) delete hero.missedFoodShopVisits;
  delete old.payload.shopEconomy.bag["iron-sword"];
  delete old.payload.shopEconomy.bag["leather-vest"];
  const input = JSON.stringify(old);
  const migrated = parseSave(input);
  assert.equal(migrated.simulationVersion, 9);
  assert.deepEqual(migrated, state);
  assert.equal(JSON.stringify(old), input);
  assert.deepEqual(parseSave(JSON.stringify(createSave(migrated))), state);

  for (const badValue of [-1, 4, 1.5, "three", null]) {
    const corrupt: any = createSave(state);
    corrupt.payload.adventurers[0].missedFoodShopVisits = badValue;
    assert.throws(() => parseSave(JSON.stringify(corrupt)), /missedFoodShopVisits/);
  }
  const future = structuredClone(old);
  future.simulationVersion = 42;
  assert.throws(() => parseSave(JSON.stringify(future)), /incompatible/);
  const forged = structuredClone(old);
  forged.payload.events[0].type = "found-food";
  assert.throws(() => parseSave(JSON.stringify(forged)), /type/);
});

test("unmanaged 180-day campaigns remain bounded, deterministic and valid after save/reload", () => {
  let baseline = createGameState(7351);
  let restored = createGameState(7351);
  let finds = 0;
  for (let day = 0; day < 180; day += 1) {
    const next = advanceDay(baseline);
    baseline = next.state;
    restored = advanceDay(parseSave(JSON.stringify(createSave(restored)))).state;
    assert.deepEqual(restored, baseline);
    finds += next.events.filter(e=>e.type === "found-food").length;
    for (const event of next.events.filter(e=>e.type === "starvation")) {
      const hero = baseline.adventurers.find(h=>h.id===event.adventurerId)!;
      assert(hero.missedFoodShopVisits >= ECONOMY.missedFoodShopsBeforeStarvation);
      assert(hero.hunger >= ECONOMY.starvationThreshold);
    }
    assert(baseline.adventurers.filter(h=>h.status!=="dead").length<=20);
    assert(baseline.adventurers.every(h=>h.inventory.food <= 2));
  }
  assert(finds > 0, "surviving adventurers should sometimes find food on floors");
});
