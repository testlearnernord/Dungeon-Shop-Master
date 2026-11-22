import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { useHealingSupplies, generateAdventurer, type AdventurerState } from "../../src/game/adventurers.ts";
import { buyWholesale, createEconomy, discardBag, ECONOMY, ITEMS, SHELF_GOODS, transferShelf, tradeAtStartOfDay, type ItemId } from "../../src/game/economy.ts";
import { advanceDay, type GameState } from "../../src/game/gameState.ts";
import {payWantedItems} from "./physicalCheckoutFixture.ts";

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
  assert.deepEqual(ITEMS.map((item) => item.id), ["healing-herb", "mana-potion", "iron-ore", "coal", "bread", "iron-sword", "leather-vest"]);
  assert.deepEqual(SHELF_GOODS.map(item=>item.id),
    ["healing-herb","mana-potion","bread","iron-sword","leather-vest"]);
  for (const item of ITEMS) {
    assert(item.wholesaleCost > 0 && item.salePrice > item.wholesaleCost);
    assert(item.color.startsWith("#") && item.name.length > 0);
  }
  const first = createEconomy();
  const second = createEconomy();
  assert.equal(ECONOMY.bagCapacity, 24);
  assert.notEqual(first.bag, second.bag);
  assert.notEqual(first.slots, second.slots);
  assert.deepEqual(first.slots,[]);
  assert.deepEqual(second.slots,[]);
  assert.deepEqual(first.bag, { "healing-herb": 5, "mana-potion": 3, "iron-ore": 0, bread: 2, "iron-sword": 0, "leather-vest": 0, coal:0 });
  assert.deepEqual(first.materialStorage,{"iron-ore":0,coal:0});
  assert.notStrictEqual(first.materialStorage,second.materialStorage);
  assert.equal(first.slots.length,0,"merchandise stays in the bag until a real shelf is built");
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
    ...state.shopEconomy.bag, bread: 16,
  } } };
  assert.equal(buyWholesale(full, "bread", 1).state, full);
  const almostFull = { ...full, shopEconomy: { ...full.shopEconomy, bag: { ...full.shopEconomy.bag, bread: 15 } } };
  assert.equal(buyWholesale(almostFull, "bread", 2).state, almostFull);
  assert.equal(buyWholesale(almostFull, "bread", 1).state.shopEconomy.bag.bread, 16);
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
  const result = discardBag(state, "bread");
  assert.match(result.message, /^Discarded/);
  assert.equal(result.state.shopEconomy.bag.bread, state.shopEconomy.bag.bread - 1);
  assert.equal(result.state.shopEconomy.balance, state.shopEconomy.balance);
  assert.equal(result.state.shopEconomy.slots, state.shopEconomy.slots);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(discardBag(state, "bread"), result);
  assert.strictEqual(discardBag(state,"iron-ore").state,state);
  assert.equal(discardBag(state, "missing" as ItemId).state, state);
  const empty = freeze({
    ...state, shopEconomy: { ...state.shopEconomy, bag: { ...state.shopEconomy.bag, bread: 0 } },
  });
  assert.equal(discardBag(empty, "bread").state, empty);
});

test("bankrupt merchants cannot receive free healing stock", () => {
  const base=market([]);
  const bankrupt={...base,shopEconomy:{...base.shopEconomy,balance:0,
    bag:{...base.shopEconomy.bag,bread:0,"healing-herb":0}}};
  const result=advanceDay(freeze(bankrupt));
  assert.equal(result.state.shopEconomy.bag.bread,0);
  assert.equal(result.state.shopEconomy.balance,0);
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
  const fullBag = { ...state, shopEconomy: { ...state.shopEconomy, bag: { ...state.shopEconomy.bag, bread: 16 } } };
  assert.equal(transferShelf(fullBag, "shelf-1-slot-2", "bread", "remove").state, fullBag);
});

test("stable competing buyers exchange shelf units and gold exactly once, never buying from the bag", () => {
  const state = freeze(stock(market([customer(1), customer(2), customer(3)]), "bread", 3));
  const trade = tradeAtStartOfDay(state, 2);
  assert.deepEqual(trade.adventurers.map((hero) => hero.inventory.bread), [2, 1, 0]);
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
  const second = customer(2, { inventory: { bread: 2, healing: 1, loot: 0 } });
  let state = stock(market([first, second]), "bread", 5);
  state = stock(state, "bread", 5, 1);
  const trade = tradeAtStartOfDay(freeze(state), 2);
  assert.equal(trade.adventurers[0].gold, 3);
  assert.equal(trade.adventurers[0].inventory.bread, 1);
  assert.equal(trade.adventurers[1].gold, second.gold);
  assert.equal(trade.economy.dailySales.units, 1);
});

test("day transitions bring visitors but never perform invisible sales", () => {
  const heroes = [
    customer(1, { status: "traveling", floor: "transit" }),
    customer(2, { status: "exploring", floor: 4 }),
    customer(3, { status: "returning", floor: "transit" }),
    customer(4, { status: "dead", health: 0 }),
  ];
  const state = freeze(stock(market(heroes), "bread", 5));
  const result = advanceDay(state);
  assert.equal(result.state.shopEconomy.dailySales.units, 0);
  assert.equal(result.state.adventurers[0].status, "at-shop");
  assert.equal(result.state.adventurers[0].inventory.bread, 0);
  assert.equal(result.state.adventurers[3], heroes[3]);
  assert(!advanceDay(result.state).events.some(event=>event.type==="sale"),
    "Merchandise can only leave the shop after a physical payment or credit");
});

test("healing only happens to injured adventurers and consumes one item",()=>{
  const hero=customer(1,{health:10,inventory:{bread:2,healing:1,loot:0}});
  const breadOnly=useHealingSupplies({...hero,inventory:{...hero.inventory,healing:0}},2);
  assert.equal(breadOnly.adventurer.health,18);
  assert.equal(breadOnly.adventurer.inventory.bread,1);
  assert.equal(breadOnly.events[0]?.itemId,"bread");
  const withHerb=useHealingSupplies(hero,2);
  assert.equal(withHerb.adventurer.health,28);
  assert.equal(withHerb.adventurer.inventory.healing,0);
  assert.equal(withHerb.adventurer.inventory.bread,2);
  assert.equal(withHerb.events[0]?.itemId,"healing-herb");
  const healthy={...hero,health:hero.stats.maxHealth};
  assert.deepEqual(useHealingSupplies(healthy,3),{adventurer:healthy,events:[]});
  const empty={...hero,inventory:{...hero.inventory,bread:0,healing:0}};
  assert.deepEqual(useHealingSupplies(empty,3),{adventurer:empty,events:[]});
});
test("actual cashier sells Waybread and herbs at catalog prices without applying remote healing",()=>{
  const hero=customer(1,{health:10,
    inventory:{bread:0,healing:0,loot:0},
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"}});
  let state=stock(market([hero]),"bread",1);
  state=freeze(stock(state,"healing-herb",1,1));
  const result=payWantedItems(state,hero.id);
  const next=result.state.adventurers[0];
  assert.equal(next.health,10,"Buying supplies must not heal the hero retroactively");
  assert.equal(next.inventory.bread,1);
  assert.equal(next.inventory.healing,1);
  assert.equal(next.gold,hero.gold-10);
  assert.deepEqual(result.events.map(event=>event.itemId),["healing-herb","bread"]);
});
test("injuries without stocked healing supplies cause no passive HP loss",()=>{
  const hero=customer(1,{health:7});
  const result=advanceDay(freeze(market([hero])));
  assert.equal(result.state.adventurers[0].health,7);
  assert.notEqual(result.state.adventurers[0].status,"dead");
});

test("manual revenue belongs only to the paid day and resets on next day", () => {
  const hero=customer(1,{inventory:{bread:0,healing:0,loot:0}});
  const state=stock(market([hero]),"bread",1);
  const paid=payWantedItems(state,hero.id).state;
  assert.equal(paid.shopEconomy.dailySales.units,1);
  const first=advanceDay(paid).state;
  assert.deepEqual(first.shopEconomy.dailySales,{day:2,units:0,revenue:0});
  const second=advanceDay(first).state;
  assert.deepEqual(second.shopEconomy.dailySales,{day:3,units:0,revenue:0});
});

test("no automatic subsidies during an empty shop day",()=>{
  const base=market([]);
  const result=advanceDay({...base,shopEconomy:{...base.shopEconomy,balance:0,
    bag:{...base.shopEconomy.bag,bread:0}}});
  assert.equal(result.state.shopEconomy.bag.bread,0);
  assert.equal(result.state.shopEconomy.balance,0);
});

test("55-day JSON-reloaded merchant input replay is deterministic and admits newcomers when slots exist", () => {
  let first = createGameState(2026);
  let second = createGameState(2026);
  let lateArrivals = 0;
  let lateDaysWithVacancies = 0;
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
    if(day>49 && first.adventurers.filter(hero=>hero.status!=="dead").length <
       first.populationConfig.maxActive) lateDaysWithVacancies++;
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
  assert(lateArrivals>0 || lateDaysWithVacancies===0,
    "late newcomer supply is required only when a living roster slot exists");
  assert(first.adventurers.length > 10,
    "a living dungeon can retain veteran heroes without an artificial death quota");
  assert(first.adventurers.length <= 10 + 55 * first.populationConfig.dailyInflux,
    "newcomer IDs and population must remain bounded by actual scheduled influx");
  assert(purchases > 0);
  assert(stocking > 0);
  assert(removals > 0);
});

test("Shift-fill is one bounded, pure stock transfer with no generated gold",()=>{
  const state=freeze(createGameState());
  const slotId=state.shopEconomy.slots[0].id;
  const placed=transferShelf(state,slotId,"healing-herb","stock",5);
  assert.match(placed.message,/Placed 5 Healing Herb/);
  assert.equal(placed.state.shopEconomy.slots[0].quantity,5);
  assert.equal(placed.state.shopEconomy.bag["healing-herb"],0);
  assert.equal(placed.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.equal(transferShelf(placed.state,slotId,"healing-herb","stock",5).state,placed.state);
  const limited={...state,shopEconomy:{...state.shopEconomy,
    bag:{...state.shopEconomy.bag,bread:2}}};
  const partial=transferShelf(limited,limited.shopEconomy.slots[1].id,"bread","stock",5);
  assert.equal(partial.state.shopEconomy.slots[1].quantity,
    limited.shopEconomy.slots[1].quantity+2);
  assert.equal(partial.state.shopEconomy.bag.bread,0);
  assert.equal(transferShelf(state,slotId,"healing-herb","stock").state.shopEconomy.slots[0].quantity,1);
  for(const invalid of [0,-1,1.5,NaN,Infinity]){
    assert.equal(transferShelf(state,slotId,"healing-herb","stock",invalid).state,state);
  }
});

test("Shift-clear preserves reserved carts, bag limit and last-slot identity",()=>{
  const state=freeze(createGameState());
  const slotId=state.shopEconomy.slots[0].id;
  const stocked=transferShelf(state,slotId,"healing-herb","stock",5).state;
  const removed=transferShelf(stocked,slotId,"healing-herb","remove",5);
  assert.equal(removed.state.shopEconomy.slots[0].quantity,0);
  assert.equal(removed.state.shopEconomy.slots[0].itemId,null);
  assert.deepEqual(removed.state,state);
  const fullBag={...stocked,shopEconomy:{...stocked.shopEconomy,
    bag:{...stocked.shopEconomy.bag,"iron-sword":19}}};
  assert.equal(transferShelf(fullBag,slotId,"healing-herb","remove",5).state,fullBag);
  const oneFree={...stocked,shopEconomy:{...stocked.shopEconomy,
    bag:{...stocked.shopEconomy.bag,"iron-sword":18}}};
  const partial=transferShelf(oneFree,slotId,"healing-herb","remove",5);
  assert.equal(partial.state.shopEconomy.slots[0].quantity,4);
  assert.equal(partial.state.shopEconomy.bag["healing-herb"],1);
  const reserved={...stocked,shopCarts:[{heroId:"held",day:stocked.day,
    lines:[{slotId,itemId:"healing-herb",quantity:1,subtotal:6}]}]};
  assert.equal(transferShelf(reserved,slotId,"healing-herb","remove",5).state,reserved);
  assert.equal(transferShelf(reserved,slotId,"healing-herb","stock",5).state,reserved);
});

test("coal and iron ore cannot be bought wholesale or placed into shelves",()=>{
  const state=createGameState();
  for(const itemId of ["iron-ore","coal"] as const){
    const wholesaled=buyWholesale(state,itemId,1);
    assert.strictEqual(wholesaled.state,state);
    assert.match(wholesaled.message,/only purchased from returning adventurers/i);
    const shelved=transferShelf(state,state.shopEconomy.slots[0].id,itemId,"stock");
    assert.strictEqual(shelved.state,state);
    assert.match(shelved.message,/cannot be placed/i);
  }
});
