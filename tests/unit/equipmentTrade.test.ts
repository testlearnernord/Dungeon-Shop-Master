import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { tradeAtStartOfDay, buyWholesale, transferShelf, ITEMS } from "../../src/game/economy.ts";
import { simulateDungeon } from "../../src/game/dungeonSimulation.ts";
import { simulateLevel6Combat } from "../../src/game/level6Combat.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

function merchantState(gold: number, stocked: ReadonlyArray<{ itemId: "iron-sword" | "leather-vest" | "bread" | "healing-herb"; quantity: number }>) {
  const base = createGameState();
  const customer = { ...base.adventurers[0], status: "at-shop" as const, floor: 5 as const,
    gold, health: base.adventurers[0].stats.maxHealth - 20 };
  return { ...base, adventurers: [customer], shopEconomy: {
    ...base.shopEconomy,
    balance: 50,
    bag: { ...base.shopEconomy.bag, "iron-sword": 0, "leather-vest": 0 },
    slots: base.shopEconomy.slots.map((slot, i) => {
      const product = stocked[i];
      return { ...slot, itemId: product?.itemId ?? null, quantity: product?.quantity ?? 0 };
    }),
  } };
}

test("equipment catalog, wholesale and shelf stocking conserve gold and inventory", () => {
  const initial = createGameState();
  assert.equal(SIMULATION_VERSION, 8);
  assert(ITEMS.some(x => x.id === "iron-sword" && x.kind === "weapon"));
  assert(ITEMS.some(x => x.id === "leather-vest" && x.kind === "armor"));
  assert.equal(initial.shopEconomy.bag["iron-sword"], 0);
  const bought = buyWholesale(initial, "iron-sword", 1);
  assert.equal(bought.state.shopEconomy.balance, 15);
  assert.equal(bought.state.shopEconomy.bag["iron-sword"], 1);
  const stocked = transferShelf(bought.state, "shelf-1-slot-1", "iron-sword", "stock");
  assert.equal(stocked.state.shopEconomy.bag["iron-sword"], 0);
  assert.equal(stocked.state.shopEconomy.slots[0].itemId, "iron-sword");
  assert.deepEqual(initial, createGameState(), "new trade must never mutate original state");
});

test("food and healing come before equipment even when gear sits on the first shelf", () => {
  const stocked = [
    { itemId: "iron-sword" as const, quantity: 2 },
    { itemId: "leather-vest" as const, quantity: 2 },
    { itemId: "bread" as const, quantity: 1 },
    { itemId: "healing-herb" as const, quantity: 1 },
  ];
  const limited = merchantState(14, stocked);
  const trade = tradeAtStartOfDay(limited, 2);
  const hero = trade.adventurers[0];
  assert.equal(hero.gold, 4, "4g food + 6g healing before gear");
  assert.equal(hero.inventory.food, 1);
  assert.equal(hero.inventory.healing, 1);
  assert.deepEqual(hero.equipment, { weapon: null, armor: null });
  assert.equal(trade.economy.balance, 60);
  assert.equal(trade.economy.slots[0].quantity, 2);
  assert.equal(trade.economy.dailySales.revenue, 10);
  assert.deepEqual(trade.events.map(e=>e.itemId), ["bread", "healing-herb"]);
  assert.deepEqual(tradeAtStartOfDay(limited, 2), trade);
});

test("equipping is permanent, single-purchase, affordable, and exact in receipts", () => {
  const input = merchantState(35, [
    { itemId: "iron-sword", quantity: 2 },
    { itemId: "leather-vest", quantity: 2 },
    { itemId: "bread", quantity: 1 },
    { itemId: "healing-herb", quantity: 1 },
  ]);
  const first = tradeAtStartOfDay(input, 2);
  assert.equal(first.adventurers[0].equipment.weapon, "Iron Sword");
  assert.equal(first.adventurers[0].equipment.armor, "Leather Vest");
  assert.equal(first.adventurers[0].gold, 8);
  assert.equal(first.economy.dailySales.units, 4);
  assert.equal(first.economy.dailySales.revenue, 27);
  assert.deepEqual(first.events.map(e=>e.itemId), ["bread", "healing-herb", "iron-sword", "leather-vest"]);
  for (const event of first.events) {
    const item = ITEMS.find(x=>x.id===event.itemId)!;
    assert.equal(event.revenue, item.salePrice * event.quantity!);
  }
  const replay = tradeAtStartOfDay({ ...input, shopEconomy: first.economy,
    adventurers: [{ ...first.adventurers[0], gold: 100 }] }, 3);
  assert.equal(replay.events.filter(e=>e.itemId==="iron-sword" || e.itemId==="leather-vest").length, 0);
  assert.deepEqual(replay.adventurers[0].equipment, first.adventurers[0].equipment);
  assert.deepEqual(input.adventurers[0].equipment, { weapon: null, armor: null });
});

test("gear reduces danger and improves sword attack without granting invulnerability", () => {
  const base = createGameState().adventurers[0];
  const normal = { ...base, floor: 3 as const, status: "exploring" as const };
  const armored = { ...normal, equipment: { weapon: null, armor: "Leather Vest" } };
  let damageLower = false, survivedExtra = false;
  for (let seed = 1; seed <= 100; seed++) {
    const n = simulateDungeon(normal, 2, seed);
    const a = simulateDungeon(armored, 2, seed);
    assert(a.adventurer.health >= n.adventurer.health);
    if (a.adventurer.health > n.adventurer.health) damageLower = true;
    if (a.adventurer.status !== "dead" && n.adventurer.status === "dead") survivedExtra = true;
  }
  assert(damageLower);
  // L6 samples with healthy hero, fixed seed; sword reduces required combat rounds.
  const novice = { ...base, status: "expedition" as const, floor: 6 as const, level6Permit: true };
  const armed = { ...novice, equipment: { weapon: "Iron Sword", armor: "Leather Vest" } };
  const first = simulateLevel6Combat(novice, 2, 1234);
  const improved = simulateLevel6Combat(armed, 2, 1234);
  assert(improved.adventurer.health >= first.adventurer.health);
  assert.equal(improved.adventurer.equipment.weapon, "Iron Sword");
  assert.equal(simulateLevel6Combat(armed,2,1234).rngState,improved.rngState);
  void survivedExtra;
});

test("strict historical v6 saves gain empty equipment stock while preserving full progression", () => {
  let state = createGameState();
  for (let i=0; i<8; i++) state=advanceDay(state).state;
  const old: any = structuredClone(createSave(state));
  old.simulationVersion = 6;
  old.payload.simulationVersion = 6;
  delete old.payload.level7World; // Genuine historical v6 payloads predate the dungeon state.
  delete old.payload.shopEconomy.bag["iron-sword"];
  delete old.payload.shopEconomy.bag["leather-vest"];
  const original=JSON.stringify(old);
  const migrated=parseSave(original);
  assert.deepEqual(migrated,state);
  assert.equal(JSON.stringify(old), original);
  assert.deepEqual(parseSave(JSON.stringify(createSave(migrated))),migrated);
  const corrupt = structuredClone(old);
  corrupt.payload.shopEconomy.bag["iron-sword"]=1;
  assert.throws(()=>parseSave(JSON.stringify(corrupt)),/iron-sword/);
  const damaged = structuredClone(createSave(state)) as any;
  delete damaged.payload.shopEconomy.bag["leather-vest"];
  assert.throws(()=>parseSave(JSON.stringify(damaged)),/leather-vest/);
});

test("long deterministic campaigns remain stable across sale, combat and reload", () => {
  let a=createGameState(), b=createGameState();
  for(let d=0;d<110;d++){
    a=advanceDay(a).state;
    b=advanceDay(parseSave(JSON.stringify(createSave(b)))).state;
    assert.deepEqual(a,b);
  }
});
