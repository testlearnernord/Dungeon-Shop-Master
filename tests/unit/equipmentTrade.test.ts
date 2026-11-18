import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { tradeAtStartOfDay, buyWholesale, transferShelf, ITEMS } from "../../src/game/economy.ts";
import { generateExpeditionLayout, dungeonNeighbors } from "../../src/game/dungeonLayout.ts";
import { simulateSpatialDungeonDay } from "../../src/game/level7Exploration.ts";
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
  assert.equal(SIMULATION_VERSION, 14);
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

test("Waybread and herbs come before equipment even when gear sits on the first shelf", () => {
  const stocked = [
    { itemId: "iron-sword" as const, quantity: 2 },
    { itemId: "leather-vest" as const, quantity: 2 },
    { itemId: "bread" as const, quantity: 1 },
    { itemId: "healing-herb" as const, quantity: 1 },
  ];
  const limited = merchantState(14, stocked);
  const trade = tradeAtStartOfDay(limited, 2);
  const hero = trade.adventurers[0];
  assert.equal(hero.gold, 4, "4g Waybread + 6g herbs before gear");
  assert.equal(hero.inventory.bread, 1);
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

test("real early-floor traps respect equipped armor and boss damage still respects gear", () => {
  const base=createGameState().adventurers[0];
  const layout=generateExpeditionLayout(7351,2);
  const trap=layout.features.find(site=>site.kind==="trap")!;
  const approach=dungeonNeighbors(layout,trap)[0];
  const trapCell=trap.z*layout.width+trap.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile!=="wall"&&i!==trapCell?[i]:[]);
  const world={
    resolvedFeatureIds:layout.features.filter(site=>site.id!==trap.id).map(site=>site.id),
    heroes:[{heroId:base.id,...approach,visited}],
  };
  const normal={...base,floor:2 as const,status:"exploring" as const};
  const armored={...normal,equipment:{weapon:null,armor:"Leather Vest"}};
  const plain=simulateSpatialDungeonDay(normal,world,7351,2);
  const protectedRun=simulateSpatialDungeonDay(armored,world,7351,2);
  assert.equal(plain.replay.steps.find(step=>step.action==="trap")?.featureId,trap.id);
  assert.equal(protectedRun.replay.steps.find(step=>step.action==="trap")?.featureId,trap.id);
  assert.equal(protectedRun.adventurer.health-plain.adventurer.health,3);
  assert.equal(plain.adventurer.level,1+Math.floor(plain.adventurer.xp/100));

  // Existing boss replay authority still uses real armor and weapon effects,
  // and must not be replaced by a separate early-floor dice outcome.
  const novice={...base,status:"expedition" as const,floor:6 as const,level6Permit:true};
  const armed={...novice,equipment:{weapon:"Iron Sword",armor:"Leather Vest"}};
  const first=simulateLevel6Combat(novice,2,1234);
  const improved=simulateLevel6Combat(armed,2,1234);
  assert(improved.adventurer.health>=first.adventurer.health);
  assert.equal(improved.adventurer.equipment.weapon,"Iron Sword");
  assert.equal(simulateLevel6Combat(armed,2,1234).rngState,improved.rngState);
});

test("long deterministic campaigns remain stable across sale, combat and reload", () => {
  let a=createGameState(), b=createGameState();
  for(let d=0;d<18;d++){
    a=advanceDay(a).state;
    b=advanceDay(parseSave(JSON.stringify(createSave(b)))).state;
    assert.deepEqual(a,b);
  }
});
