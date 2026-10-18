import assert from "node:assert/strict";
import test from "node:test";
import { generateAdventurer, type AdventurerState } from "../../src/game/adventurers.ts";
import { simulateDungeon } from "../../src/game/dungeonSimulation.ts";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { SeededRandom } from "../../src/game/random.ts";
import { scheduleShopVisit } from "../../src/game/shopArrivals.ts";

test("Day 1 has ten generated persistent heroes, exactly three distinct Level 5 visitors", () => {
  const state = createGameState();
  assert.equal(state.adventurers.length, 10);
  assert.equal(new Set(state.adventurers.map((hero) => hero.id)).size, 10);
  const visitors = state.adventurers.filter((hero) => hero.status === "at-shop");
  assert.equal(visitors.length, 3);
  assert(visitors.every((hero) => hero.floor === 5));
  assert(state.adventurers.slice(3).every((hero) => hero.floor <= 4 && hero.status === "exploring"));
  assert.equal(state.events.filter((event) => event.type === "shop-arrival").length, 3);
  for (const hero of state.adventurers) {
    assert(hero.name.length > 0);
    assert(["tank", "DPS", "healer"].includes(hero.role));
    assert(hero.traits.positive && hero.traits.neutral && hero.traits.negative);
    assert.equal(hero.health, hero.stats.maxHealth);
    assert.equal(hero.level, 1);
    assert.equal(hero.xp, 0);
    assert.deepEqual(hero.inventory, { food: 0, loot: 0 });
    assert.equal(hero.hunger, 0);
    assert.deepEqual(hero.equipment, { weapon: null, armor: null });
  }
});

test("generation and RNG are reproducible, including zero seed and resumed streams", () => {
  const first = new SeededRandom(0);
  const second = new SeededRandom(0);
  assert.deepEqual(generateAdventurer(1, first.state), generateAdventurer(1, second.state));
  assert.notDeepEqual(createGameState(1).adventurers, createGameState(2).adventurers);
  assert.equal(first.next(), new SeededRandom(second.state).next());
  for (const seed of [-1, 1.5, NaN, Infinity, 0x100000000]) {
    assert.throws(() => createGameState(seed), RangeError);
  }
});

test("each dungeon outcome preserves bounded stats and only defined outcomes create loot", () => {
  const hero = { ...generateAdventurer(1, 42).adventurer, floor: 3 as const };
  const outcomes = new Set<string>();
  let foundLoot = false;
  for (let seed = 0; seed < 3000; seed += 1) {
    const result = simulateDungeon(hero, 2, seed);
    const next = result.adventurer;
    const event = result.events[0];
    outcomes.add(event.outcome!);
    assert.equal(next.id, hero.id);
    assert(next.health >= 0 && next.health < hero.health);
    assert(next.floor >= 1 && next.floor <= 4);
    assert(next.xp - hero.xp >= 0 && next.xp - hero.xp <= 20);
    assert.equal(next.level, 1 + Math.floor(next.xp / 100));
    assert(next.gold - hero.gold >= 0 && next.gold - hero.gold <= 4);
    assert([0, 1].includes(next.inventory.loot - hero.inventory.loot));
    assert.equal(next.inventory.food, 0);
    if (next.inventory.loot > 0) {
      foundLoot = true;
      assert(next.gold > hero.gold);
      assert(["advance", "stay"].includes(event.outcome!));
    }
    if (event.outcome === "retreat") assert.equal(next.floor, 2);
    if (event.outcome === "advance") assert.equal(next.floor, 4);
    if (event.outcome === "stay") assert.equal(next.floor, 3);
    if (event.outcome === "death") {
      assert.equal(next.health, 0);
      assert.equal(next.status, "dead");
      assert.equal(next.gold, hero.gold);
      assert.equal(next.inventory.loot, hero.inventory.loot);
    }
  }
  assert.deepEqual([...outcomes].sort(), ["advance", "death", "retreat", "stay"]);
  assert(foundLoot);
});

test("injury can kill, XP levels up, and dead heroes never run dungeon or shop outcomes", () => {
  const hero = generateAdventurer(1, 5).adventurer;
  const injured = simulateDungeon({ ...hero, health: 1 }, 2, 1000);
  assert.equal(injured.adventurer.status, "dead");
  assert.deepEqual(simulateDungeon(injured.adventurer, 3, 1), {
    adventurer: injured.adventurer, events: [], rngState: 1,
  });
  assert.deepEqual(scheduleShopVisit(injured.adventurer, 3, 1), {
    adventurer: injured.adventurer, events: [], rngState: 1,
  });
  const leveled = simulateDungeon({ ...hero, xp: 99 }, 2, 1000);
  assert.equal(leveled.adventurer.level, 2);
});

test("floor 4 travelers arrive, stay briefly, return to floor 4 and can revisit with the same ID", () => {
  const hero = { ...generateAdventurer(1, 3).adventurer, floor: 4 as const };
  const dungeon = simulateDungeon(hero, 2, 1000);
  assert.equal(dungeon.adventurer.status, "traveling");
  const arrival = scheduleShopVisit(dungeon.adventurer, 2, 1);
  assert.equal(arrival.adventurer.floor, 5);
  assert.equal(arrival.adventurer.status, "at-shop");
  assert.equal(arrival.events[0].type, "shop-arrival");
  const stay = scheduleShopVisit(arrival.adventurer, 3, 1);
  assert.equal(stay.adventurer.status, "at-shop");
  const departure = scheduleShopVisit(stay.adventurer, 4, 1);
  assert.equal(departure.adventurer.floor, 4);
  assert.equal(departure.adventurer.status, "returning");
  const returnTrip = simulateDungeon(departure.adventurer, 5, 1000);
  const revisit = scheduleShopVisit(returnTrip.adventurer, 5, 1);
  assert.equal(revisit.adventurer.id, hero.id);
  assert.equal(revisit.adventurer.status, "at-shop");
  assert.notEqual(revisit.events[0].id, arrival.events[0].id);
  assert.equal(revisit.adventurer.inventory.food, 0);
});

test("identical seed and confirmed ticks reproduce a serialized multi-day session", () => {
  let first = createGameState(1234);
  let second = createGameState(1234);
  for (let tick = 0; tick < 60; tick += 1) {
    first = advanceDay(first).state;
    second = advanceDay(JSON.parse(JSON.stringify(second))).state;
    assert.deepEqual(first, second);
  }
});

test("multi-day population is bounded, IDs/events unique, deaths permanent, and visitors emerge from floor 4", () => {
  let state = createGameState();
  const dead = new Map<string, AdventurerState>();
  const departed = new Set<string>();
  let revisits = 0;
  let maxVisitors = 3;
  for (let tick = 0; tick < 100; tick += 1) {
    const before = state;
    const result = advanceDay(before);
    state = result.state;
    assert(state.adventurers.length <= 40);
    assert(state.adventurers.filter((hero) => hero.status !== "dead").length <= 20);
    assert.equal(state.adventurers.length - before.adventurers.length,
      result.events.filter((event) => event.type === "influx").length);
    assert.equal(new Set(state.adventurers.map((hero) => hero.id)).size, state.adventurers.length);
    assert.equal(new Set(state.events.map((event) => event.id)).size, state.events.length);
    maxVisitors = Math.max(maxVisitors, state.adventurers.filter((hero) => hero.status === "at-shop").length);
    for (const event of result.events) {
      if (event.type === "shop-departure") departed.add(event.adventurerId!);
      if (event.type === "shop-arrival") {
        if (departed.has(event.adventurerId!)) revisits += 1;
        const previous = before.adventurers.find((hero) => hero.id === event.adventurerId)!;
        assert.equal(previous.floor, 4);
        assert(["exploring", "returning", "traveling"].includes(previous.status));
      }
    }
    for (const hero of state.adventurers) {
      assert(hero.floor >= 1 && hero.floor <= 5);
      assert(hero.health >= 0 && hero.health <= hero.stats.maxHealth);
      assert.equal(hero.status === "at-shop", hero.floor === 5);
      assert.equal(hero.inventory.food, 0);
      assert.equal(hero.hunger, 0);
      const previous = before.adventurers.find((entry) => entry.id === hero.id);
      if (previous) {
        assert.equal(hero.name, previous.name);
        assert.equal(hero.role, previous.role);
        assert.deepEqual(hero.traits, previous.traits);
        assert.deepEqual(hero.equipment, previous.equipment);
      }
      if (dead.has(hero.id)) assert.deepEqual(hero, dead.get(hero.id));
      if (hero.status === "dead") dead.set(hero.id, hero);
    }
  }
  assert(dead.size > 0);
  assert(revisits > 0);
  assert(maxVisitors > 3);
  assert.equal(state.influxRemaining, 0);
  assert.equal(state.adventurers.length, 40);
});

test("influx is configurable, capped by living slots and a finite lifetime budget", () => {
  let state = createGameState(1, { dailyInflux: 50, maxActive: 10, totalInflux: 3 });
  state = advanceDay(state).state;
  assert(state.adventurers.filter((hero) => hero.status !== "dead").length <= 10);
  assert(state.influxRemaining >= 0);
  for (let tick = 0; tick < 60; tick += 1) state = advanceDay(state).state;
  assert.equal(state.adventurers.length, 13);
  assert.equal(state.influxRemaining, 0);
  let disabled = createGameState(1, { dailyInflux: 0 });
  for (let tick = 0; tick < 10; tick += 1) disabled = advanceDay(disabled).state;
  assert.equal(disabled.adventurers.length, 10);
  for (const config of [{ dailyInflux: -1 }, { dailyInflux: 0.5 }, { maxActive: 9 },
    { maxActive: 101 }, { totalInflux: Infinity }, { totalInflux: 1001 }]) {
    assert.throws(() => createGameState(1, config), RangeError);
  }
});
