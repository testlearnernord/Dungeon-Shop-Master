import assert from "node:assert/strict";
import test from "node:test";
import { consumeDailySupplies, generateAdventurer, type AdventurerState } from "../../src/game/adventurers.ts";
import { buyWholesale, createEconomy, discardBag, ECONOMY, ITEMS, transferShelf, tradeAtStartOfDay, type ItemId } from "../../src/game/economy.ts";
import { advanceDay, createGameState, type GameState } from "../../src/game/gameState.ts";
import { simulateDungeon } from "../../src/game/dungeonSimulation.ts";
import { scheduleShopVisit } from "../../src/game/shopArrivals.ts";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((child) => freeze(child));
    Object.freeze(value);
  }
  return value;
}

function customer(serial = 1, overrides: Partial<AdventurerState> = {}): AdventurerState {
  return {
    ...generateAdventurer(serial, 50).adventurer,
    status: "at-shop", floor: 5, gold: 100, ...overrides,
  };
}

function market(adventurers: readonly AdventurerState[] = [customer()]): GameState {
  const state = createGameState(10, { dailyInflux: 0 });
  return {
    ...state, adventurers,
    shopEconomy: {
      ...state.shopEconomy,
      slots: state.shopEconomy.slots.map((slot) => ({ ...slot, itemId: null, quantity: 0 })),
    },
  };
}

function stock(state: GameState, itemId: ItemId, quantity: number, index = 0): GameState {
  return {
    ...state, shopEconomy: {
      ...state.shopEconomy,
      slots: state.shopEconomy.slots.map((slot, position) => position === index ? { ...slot, itemId, quantity } : slot),
    },
  };
}

test("catalog, starter economy and shelf layout are complete, independent and bounded", () => {
  assert.deepEqual(ITEMS.map((item) => item.id), ["healing-herb", "mana-potion", "iron-ore", "bread"]);
  for (const item of ITEMS) {
    assert(item.wholesaleCost > 0 && item.salePrice > item.wholesaleCost);
    assert(item.color.startsWith("#") && item.name.length > 0);
  }
  const first = createEconomy();
  const second = createEconomy();
  assert.equal(ECONOMY.bagCapacity, 24);
  assert.notEqual(first.bag, second.bag);
  assert.notEqual(first.slots, second.slots);
  assert.notEqual(first.slots[0], second.slots[0]);
  assert.deepEqual(first.bag, { "healing-herb": 5, "mana-potion": 3, "iron-ore": 4, bread: 2 });
  assert.equal(first.slots[0].itemId, null);
  assert(first.slots.some((slot) => slot.itemId === "bread" && slot.quantity > 0));
  assert(first.slots.some((slot) => slot.itemId === "healing-herb" && slot.quantity > 0));
  assert(first.slots.every((slot) => slot.capacity === ECONOMY.slotCapacity && slot.quantity <= slot.capacity));
  assert.equal(new Set(first.slots.map((slot) => slot.id)).size, 10);
});

test("wholesale atomically exchanges gold for whole units and preserves frozen input", () => {
  const state = freeze(createGameState());
  const before = structuredClone(state);
  const result = buyWholesale(state, "bread", 3);
  assert.notEqual(result.state, state);
  assert.equal(result.state.shopEconomy.balance, state.shopEconomy.balance - 6);
  assert.equal(result.state.shopEconomy.bag.bread, 5);
  assert.deepEqual(state, before);
  assert.equal(result.state.shopEconomy.slots, state.shopEconomy.slots);
  assert.deepEqual(buyWholesale(state, "bread", 3), result);
});

test("wholesale rejects invalid quantities, item IDs, insufficient funds and overflow without partial changes", () => {
  const state = freeze(createGameState());
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(buyWholesale(state, "bread", quantity).state, state);
  }
  assert.equal(buyWholesale(state, "missing" as ItemId, 1).state, state);
  const poor = { ...state, shopEconomy: { ...state.shopEconomy, balance: 1 } };
  assert.equal(buyWholesale(poor, "bread", 1).state, poor);
  const full = { ...state, shopEconomy: { ...state.shopEconomy, balance: 100, bag: {
    ...state.shopEconomy.bag, bread: 12,
  } } };
  assert.equal(buyWholesale(full, "bread", 1).state, full);
  const almostFull = { ...full, shopEconomy: { ...full.shopEconomy, bag: { ...full.shopEconomy.bag, bread: 11 } } };
  assert.equal(buyWholesale(almostFull, "bread", 2).state, almostFull);
  assert.equal(buyWholesale(almostFull, "bread", 1).state.shopEconomy.bag.bread, 12);
});

test("shelf stock/remove conserves each item and gold, and clears the last unit", () => {
  const state = freeze(createGameState());
  const slotId = state.shopEconomy.slots[0].id;
  const placed = transferShelf(state, slotId, "healing-herb", "stock").state;
  assert.equal(placed.shopEconomy.bag["healing-herb"], 4);
  assert.equal(placed.shopEconomy.slots[0].quantity, 1);
  assert.equal(placed.shopEconomy.slots[0].itemId, "healing-herb");
  assert.equal(placed.shopEconomy.balance, state.shopEconomy.balance);
  const removed = transferShelf(freeze(placed), slotId, "healing-herb", "remove").state;
  assert.deepEqual(removed, state);
  assert.deepEqual(transferShelf(state, slotId, "healing-herb", "stock").state, placed);
});

test("discarding removes exactly one bag unit without refund and is pure and deterministic", () => {
  const state = freeze(createGameState());
  const snapshot = structuredClone(state);
  const result = discardBag(state, "iron-ore");
  assert.match(result.message, /^Discarded/);
  assert.equal(result.state.shopEconomy.bag["iron-ore"], state.shopEconomy.bag["iron-ore"] - 1);
  assert.equal(result.state.shopEconomy.balance, state.shopEconomy.balance);
  assert.equal(result.state.shopEconomy.slots, state.shopEconomy.slots);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(discardBag(state, "iron-ore"), result);
  assert.equal(discardBag(state, "missing" as ItemId).state, state);
  const empty = freeze({
    ...state, shopEconomy: { ...state.shopEconomy, bag: { ...state.shopEconomy.bag, "iron-ore": 0 } },
  });
  assert.equal(discardBag(empty, "iron-ore").state, empty);
});

test("saturated nonfood storage can be cleared without refund to receive aid, stock food and resume sales", () => {
  const base = market([customer()]);
  const saturated: GameState = freeze({
    ...base,
    rngState: 1,
    shopEconomy: {
      ...base.shopEconomy,
      balance: 0,
      bag: { "iron-ore": ECONOMY.bagCapacity, "healing-herb": 0, "mana-potion": 0, bread: 0 },
      slots: base.shopEconomy.slots.map((slot) => ({ ...slot, itemId: "iron-ore", quantity: slot.capacity })),
    },
  });
  assert.equal(tradeAtStartOfDay(saturated, 1).events.some((event) => event.type === "rescue"), false);
  let state = discardBag(saturated, "iron-ore").state;
  assert.equal(state.shopEconomy.balance, 0);
  const rescued = advanceDay(freeze(state));
  state = rescued.state;
  assert.equal(state.shopEconomy.bag.bread, 1);
  assert.equal(rescued.events.filter((event) => event.type === "rescue").length, 1);
  assert.equal(state.shopEconomy.balance, 0);
  assert.equal(state.adventurers[0].status, "at-shop");
  // Five bag spaces let the player empty one five-unit shelf slot.
  for (let count = 0; count < ECONOMY.slotCapacity; count += 1) {
    state = discardBag(freeze(state), "iron-ore").state;
  }
  for (let count = 0; count < ECONOMY.slotCapacity; count += 1) {
    state = transferShelf(freeze(state), "shelf-1-slot-1", "iron-ore", "remove").state;
  }
  assert.equal(state.shopEconomy.slots[0].itemId, null);
  state = transferShelf(freeze(state), "shelf-1-slot-1", "bread", "stock").state;
  assert.equal(state.shopEconomy.slots[0].quantity, 1);
  assert.equal(state.shopEconomy.balance, 0);
  const recovered = advanceDay(freeze(state));
  assert.equal(recovered.state.shopEconomy.dailySales.units, 1);
  assert.equal(recovered.state.shopEconomy.balance, 4);
  assert(recovered.events.some((event) => event.type === "sale" && event.itemId === "bread"));
  assert.notEqual(buyWholesale(recovered.state, "bread", 1).state, recovered.state);
});

test("shelf transactions reject missing, full, wrong-item, empty and invalid operations atomically", () => {
  const state = freeze(createGameState());
  const slotId = state.shopEconomy.slots[0].id;
  for (const [id, item, direction] of [
    ["no-slot", "bread", "stock"], [slotId, "invalid", "stock"],
    [slotId, "bread", "invalid"], [slotId, "bread", "remove"],
    ["shelf-1-slot-2", "healing-herb", "stock"],
    ["shelf-1-slot-2", "healing-herb", "remove"],
  ]) {
    assert.equal(transferShelf(state, id, item as ItemId, direction as "stock").state, state);
  }
  const full = stock(state, "bread", 5);
  assert.equal(transferShelf(full, slotId, "bread", "stock").state, full);
  const emptyBag = { ...state, shopEconomy: { ...state.shopEconomy, bag: { ...state.shopEconomy.bag, bread: 0 } } };
  assert.equal(transferShelf(emptyBag, slotId, "bread", "stock").state, emptyBag);
  const fullBag = { ...state, shopEconomy: { ...state.shopEconomy, bag: { ...state.shopEconomy.bag, bread: 12 } } };
  assert.equal(transferShelf(fullBag, "shelf-1-slot-2", "bread", "remove").state, fullBag);
});

test("stable competing buyers exchange shelf units and gold exactly once, never buying from the bag", () => {
  const state = freeze(stock(market([customer(1), customer(2), customer(3)]), "bread", 3));
  const trade = tradeAtStartOfDay(state, 2);
  assert.deepEqual(trade.adventurers.map((hero) => hero.inventory.food), [2, 1, 0]);
  assert.deepEqual(trade.adventurers.map((hero) => hero.gold), [92, 96, 100]);
  assert.equal(trade.economy.balance - state.shopEconomy.balance, 12);
  assert.deepEqual(trade.economy.dailySales, { day: 2, units: 3, revenue: 12 });
  assert.equal(trade.economy.slots[0].quantity, 0);
  assert.equal(trade.economy.slots[0].itemId, null);
  assert.deepEqual(trade.economy.bag, state.shopEconomy.bag);
  assert.equal(trade.events.filter((event) => event.type === "sale").length, 2);
  assert.deepEqual(tradeAtStartOfDay(state, 2), trade);
});

test("needs, funds and carried supplies bound sales across multiple shelves", () => {
  const first = customer(1, { gold: 7 });
  const second = customer(2, { inventory: { food: 2, healing: 1, loot: 0 } });
  let state = stock(market([first, second]), "bread", 5);
  state = stock(state, "bread", 5, 1);
  const trade = tradeAtStartOfDay(freeze(state), 2);
  assert.equal(trade.adventurers[0].gold, 3);
  assert.equal(trade.adventurers[0].inventory.food, 1);
  assert.equal(trade.adventurers[1].gold, second.gold);
  assert.equal(trade.economy.dailySales.units, 1);
});

test("only current at-shop heroes buy; arrivals and newcomers wait until the following tick", () => {
  const heroes = [
    customer(1, { status: "traveling", floor: 4 }),
    customer(2, { status: "exploring", floor: 4 }),
    customer(3, { status: "returning", floor: 4 }),
    customer(4, { status: "dead", health: 0 }),
  ];
  const state = freeze(stock(market(heroes), "bread", 5));
  const result = advanceDay(state);
  assert.equal(result.state.shopEconomy.dailySales.units, 0);
  assert.equal(result.state.adventurers[0].status, "at-shop");
  assert.equal(result.state.adventurers[0].inventory.food, 0);
  assert.equal(result.state.adventurers[3], heroes[3]);
  assert(advanceDay(result.state).events.some((event) => event.type === "sale" && event.adventurerId === heroes[0].id));
});

test("food purchases and daily consumption precede starvation, healing is purchased and consumed", () => {
  const hero = customer(1, { health: 10, hunger: 3 });
  let state = stock(market([hero]), "bread", 1);
  state = freeze(stock(state, "healing-herb", 1, 1));
  const result = advanceDay(state);
  const next = result.state.adventurers[0];
  assert.equal(next.health, 28);
  assert.equal(next.hunger, 0);
  assert.equal(next.inventory.food, 0);
  assert.equal(next.inventory.healing, 0);
  assert.equal(next.gold, hero.gold - 10);
  assert.deepEqual(result.events.filter((event) => ["sale", "ate", "healed", "starvation"].includes(event.type)).map((event) => event.type),
    ["sale", "sale", "ate", "healed"]);
});

test("shop stays grant no free healing, foodless heroes starve, and death is immutable", () => {
  const hero = customer(1, { health: 7, hunger: 2 });
  assert.equal(scheduleShopVisit(hero, 2, 1).adventurer.health, 7);
  const state = freeze(market([hero]));
  const result = advanceDay(state);
  const dead = result.state.adventurers[0];
  assert.equal(dead.status, "dead");
  assert.equal(dead.health, 0);
  assert(result.events.some((event) => event.type === "starvation"));
  assert.equal(advanceDay(freeze(result.state)).state.adventurers[0], dead);
});

test("the same vulnerable hero survives with purchased food but dies without shelf supplies", () => {
  const hero = customer(1, { health: 7, hunger: 2 });
  const empty = freeze(market([hero]));
  const supplied = freeze(stock(empty, "bread", 1));
  const starved = advanceDay(empty);
  const fed = advanceDay(supplied);
  assert.equal(starved.state.adventurers[0].status, "dead");
  assert.equal(starved.state.adventurers[0].health, 0);
  assert.notEqual(fed.state.adventurers[0].status, "dead");
  assert.equal(fed.state.adventurers[0].health, hero.health);
  assert.equal(fed.state.adventurers[0].hunger, 0);
  assert.equal(fed.state.adventurers[0].gold, hero.gold - 4);
  assert.equal(fed.state.shopEconomy.balance, supplied.shopEconomy.balance + 4);
  assert(fed.events.some((event) => event.type === "ate"));
  assert(!fed.events.some((event) => event.type === "starvation"));
});

test("carried supplies are finite, capped effects consume one unit, and hazards remain lethal", () => {
  const hero = customer(1, {
    health: 50, hunger: 1,
    inventory: { food: 2, healing: 2, loot: 8 },
  });
  const first = consumeDailySupplies(freeze(hero), 2).adventurer;
  assert.equal(first.health, hero.stats.maxHealth);
  assert.equal(first.inventory.food, 1);
  assert.equal(first.inventory.healing, 1);
  assert.equal(first.inventory.loot, 8);
  const second = consumeDailySupplies(first, 3).adventurer;
  assert.equal(second.inventory.food, 0);
  assert.equal(second.inventory.healing, 1);
  assert.equal(consumeDailySupplies(second, 4).adventurer.hunger, 1);
  const doomed = { ...second, status: "exploring" as const, floor: 4 as const, health: 1 };
  const dungeon = simulateDungeon(doomed, 5, 1000).adventurer;
  assert.equal(dungeon.status, "dead");
  assert.equal(dungeon.inventory.food, 0);
});

test("seeded exploring heroes survive with supplies where unsupplied peers die, but hazards can still kill", () => {
  let survivalDifferences = 0;
  let suppliedHazardDeaths = 0;
  for (const seed of [0, 1, 42, 1000, 2000, 12345, 7351]) {
    const hero = customer(1, { status: "exploring", floor: 3, health: 1, hunger: 2 });
    const base = { ...market([hero]), rngState: seed };
    const supplied = {
      ...base,
      adventurers: [{ ...hero, inventory: { ...hero.inventory, food: 1, healing: 1 } }],
    };
    const starved = advanceDay(freeze(base));
    const equipped = advanceDay(freeze(supplied));
    assert.equal(starved.state.adventurers[0].status, "dead");
    assert(starved.events.some((event) => event.type === "starvation"));
    assert(equipped.events.some((event) => event.type === "ate"));
    assert(equipped.events.some((event) => event.type === "healed"));
    assert(!equipped.events.some((event) => event.type === "starvation"));
    if (equipped.state.adventurers[0].status !== "dead") {
      survivalDifferences += 1;
      assert(equipped.state.adventurers[0].health > 0);
    } else {
      suppliedHazardDeaths += 1;
      assert(equipped.events.some((event) => event.type === "dungeon-outcome" && event.outcome === "death"));
    }
    assert.equal(equipped.state.adventurers[0].inventory.food, 0);
    assert.equal(equipped.state.adventurers[0].inventory.healing, 0);
  }
  assert(survivalDifferences > 0);
  assert(suppliedHazardDeaths > 0);
});

test("daily sales reset instead of accumulating", () => {
  const state = stock(market(), "bread", 1);
  const first = advanceDay(state).state;
  assert.equal(first.shopEconomy.dailySales.units, 1);
  const second = advanceDay(first).state;
  assert.deepEqual(second.shopEconomy.dailySales, { day: 3, units: 0, revenue: 0 });
});

test("bankruptcy aid is bounded, once per tick, and requires no bag or shelf food", () => {
  const base = market([]);
  const bankrupt = {
    ...base, shopEconomy: {
      ...base.shopEconomy, balance: 0, bag: { ...base.shopEconomy.bag, bread: 0 },
    },
  };
  const rescue = advanceDay(freeze(bankrupt));
  assert.equal(rescue.state.shopEconomy.bag.bread, ECONOMY.rescueQuantity);
  assert.equal(rescue.events.filter((event) => event.type === "rescue").length, 1);
  assert.equal(rescue.state.shopEconomy.lastRescueDay, 2);
  assert.equal(advanceDay(rescue.state).events.filter((event) => event.type === "rescue").length, 0);
  const alreadyRescued = { ...bankrupt, shopEconomy: { ...bankrupt.shopEconomy, lastRescueDay: 2 } };
  assert.equal(advanceDay(alreadyRescued).events.some((event) => event.type === "rescue"), false);
  const foodOnShelf = stock(bankrupt, "bread", 1);
  assert.equal(advanceDay(foodOnShelf).events.some((event) => event.type === "rescue"), false);
  const funded = { ...bankrupt, shopEconomy: { ...bankrupt.shopEconomy, balance: 2 } };
  assert.equal(advanceDay(funded).events.some((event) => event.type === "rescue"), false);
  const full = { ...bankrupt, shopEconomy: { ...bankrupt.shopEconomy, bag: {
    ...bankrupt.shopEconomy.bag, "healing-herb": 17,
  } } };
  assert.equal(advanceDay(full).events.some((event) => event.type === "rescue"), false);
});

test("aid never exceeds bag capacity and stock/removal cannot regenerate it on the same day", () => {
  const base = market([]);
  const state = {
    ...base, shopEconomy: {
      ...base.shopEconomy, balance: 0,
      bag: { ...base.shopEconomy.bag, bread: 0, "healing-herb": 16 },
    },
  };
  const rescue = tradeAtStartOfDay(freeze(state), 2);
  assert.equal(rescue.economy.bag.bread, 1);
  const noFoodAgain = { ...state, shopEconomy: { ...rescue.economy, bag: { ...rescue.economy.bag, bread: 0 } } };
  assert.equal(tradeAtStartOfDay(noFoodAgain, 2).events.length, 0);
});

test("55-day JSON-reloaded merchant input replay is deterministic and admits newcomers after day49", () => {
  let first = createGameState(2026);
  let second = createGameState(2026);
  let lateArrivals = 0;
  let purchases = 0;
  let stocking = 0;
  let removals = 0;
  for (let day = 2; day <= 56; day += 1) {
    const actions: Array<(state: GameState) => { state: GameState; message: string }> = [
      (state) => buyWholesale(state, "bread", 2),
      (state) => buyWholesale(state, "healing-herb", 1),
      (state) => transferShelf(state, "shelf-1-slot-1", "bread", "stock"),
      (state) => transferShelf(state, "shelf-1-slot-1", "bread", "stock"),
      (state) => transferShelf(state, "shelf-2-slot-1", "healing-herb", "stock"),
    ];
    if (day % 3 === 0) {
      actions.push((state) => transferShelf(state, "shelf-1-slot-1", "bread", "remove"));
    }
    for (const action of actions) {
      const snapshot = structuredClone(first);
      const original = freeze(first);
      const one = action(original);
      const two = action(freeze(JSON.parse(JSON.stringify(second))));
      assert.deepEqual(original, snapshot);
      assert.deepEqual(one, two);
      if (one.state !== original) {
        if (one.message.startsWith("Bought")) purchases += 1;
        if (one.message.startsWith("Placed")) stocking += 1;
        if (one.message.startsWith("Returned")) removals += 1;
      }
      first = one.state;
      second = JSON.parse(JSON.stringify(two.state));
    }
    const before = structuredClone(first);
    const held = freeze(first);
    const result = advanceDay(held);
    first = result.state;
    second = advanceDay(freeze(JSON.parse(JSON.stringify(second)))).state;
    assert.deepEqual(held, before);
    assert.deepEqual(first, second);
    assert(first.shopEconomy.balance >= 0);
    assert(first.shopEconomy.slots.every((slot) => slot.quantity >= 0 && slot.quantity <= slot.capacity));
    assert(first.adventurers.filter((hero) => hero.status !== "dead").length <= first.populationConfig.maxActive);
    assert(result.events.filter((event) => event.type === "influx").length <= first.populationConfig.dailyInflux);
    if (day > 49) lateArrivals += result.events.filter((event) => event.type === "influx").length;
  }
  assert(lateArrivals > 0);
  assert(first.adventurers.length > 40);
  assert(purchases > 0);
  assert(stocking > 0);
  assert(removals > 0);
});
