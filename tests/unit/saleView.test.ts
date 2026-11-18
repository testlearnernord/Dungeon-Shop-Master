import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay } from "../../src/game/gameState.ts";
import { currentDayReceipts, salesByHero } from "../../src/game/saleView.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { ITEMS } from "../../src/game/economy.ts";
import {quoteCustomerCheckout,checkoutCustomer} from "../../src/game/customerCheckout.ts";

test("receipts exactly match the authoritative day sales, buyers and item prices", () => {
  const initial = createGameState();
  assert.deepEqual(currentDayReceipts(initial), []);
  const buyer=initial.adventurers[0];
  const ready={...initial,adventurers:initial.adventurers.map(hero=>hero.id===buyer.id
    ?{...hero,gold:100,inventory:{...hero.inventory,bread:0,healing:0}}:hero)};
  const quote=quoteCustomerCheckout(ready,buyer.id);
  assert(quote,"The test needs a real physical checkout quote.");
  const state=checkoutCustomer(ready,quote).state;
  const snapshot = structuredClone(state);
  const receipts = currentDayReceipts(state);
  assert(receipts.length > 0);
  assert.equal(receipts.reduce((n, receipt) => n + receipt.quantity, 0), state.shopEconomy.dailySales.units);
  assert.equal(receipts.reduce((n, receipt) => n + receipt.revenue, 0), state.shopEconomy.dailySales.revenue);
  assert.deepEqual(receipts.map((receipt) => receipt.id),
    state.events.filter((event) => event.day === state.day && event.type === "sale").map((event) => event.id));
  for (const receipt of receipts) {
    const item = ITEMS.find(({ id }) => id === receipt.itemId)!;
    assert.equal(receipt.revenue, receipt.quantity * item.salePrice);
    assert.equal(receipt.heroName, state.adventurers.find((hero) => hero.id === receipt.heroId)!.name);
  }
  const perHero = salesByHero(receipts);
  assert.equal([...perHero.values()].reduce((sum, sale) => sum + sale.units, 0), state.shopEconomy.dailySales.units);
  assert.equal([...perHero.values()].reduce((sum, sale) => sum + sale.gold, 0), state.shopEconomy.dailySales.revenue);
  assert.deepEqual(state, snapshot, "receipt projection must never mutate gameplay state");
});

test("save/reload and later ticks retain exactly the same receipts without replaying purchases", () => {
  let state = advanceDay(createGameState()).state;
  for (let step = 0; step < 8; step += 1) {
    const loaded = parseSave(JSON.stringify(createSave(state)));
    assert.deepEqual(currentDayReceipts(loaded), currentDayReceipts(state));
    assert.deepEqual(advanceDay(loaded), advanceDay(state));
    state = advanceDay(state).state;
  }
});

test("empty shelves produce no fictitious receipts or revenue", () => {
  const initial = createGameState();
  const state = {
    ...initial,
    shopEconomy: {
      ...initial.shopEconomy,
      slots: initial.shopEconomy.slots.map((slot) => ({ ...slot, itemId: null, quantity: 0 })),
    },
  };
  const next = advanceDay(state).state;
  assert.deepEqual(currentDayReceipts(next), []);
  assert.equal(next.shopEconomy.dailySales.units, 0);
  assert.equal(next.shopEconomy.dailySales.revenue, 0);
  assert.equal(salesByHero([]).size, 0);
});
