import assert from "node:assert/strict";
import test from "node:test";
import {createStockedShopState} from "./shopFixtures.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {payWantedItems} from "./physicalCheckoutFixture.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {pickUpShopItem,payReservedShopCart} from "../../src/game/shopCarts.ts";
import {preferredShopItemOrder} from "../../src/game/economy.ts";
import type {GameState} from "../../src/game/gameState.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

function prepared(role:AdventurerState["role"],gold:number,healthFraction=1):
  {state:GameState;heroId:string}{
  const initial=createStockedShopState(7351);
  const original=initial.adventurers[0];
  const hero={...original,role,health:Math.max(1,
    Math.floor(original.stats.maxHealth*healthFraction)),
    gold,status:"at-shop" as const,floor:5 as const,
    inventory:{...original.inventory,bread:0,healing:0},
    equipment:{weapon:null,armor:null}};
  const items=["iron-sword","leather-vest","bread","healing-herb"] as const;
  const state:GameState={...initial,
    adventurers:initial.adventurers.map(h=>h.id===hero.id?hero:h),
    shopEconomy:{...initial.shopEconomy,
      slots:initial.shopEconomy.slots.map((slot,index)=>
        index<4?{...slot,itemId:items[index],quantity:3}:
          {...slot,itemId:null,quantity:0})},
  };
  return {state,heroId:hero.id};
}

test("a healthy DPS buys a real sword with 9g instead of spending the budget on bread",()=>{
  const {state,heroId}=prepared("DPS",9);
  const before=structuredClone(state);
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.deepEqual(plan.items.map(item=>item.itemId),["iron-sword"]);
  assert.equal(plan.total,9);
  assert.deepEqual(state,before,"A purchase forecast may not change physical stock");
  const checkout=payWantedItems(state,heroId);
  const hero=checkout.state.adventurers.find(h=>h.id===heroId)!;
  assert.equal(hero.equipment.weapon,"Iron Sword");
  assert.equal(hero.inventory.bread,0);
  assert.equal(hero.gold,0);
  assert.equal(checkout.state.shopEconomy.balance,
    state.shopEconomy.balance+9);
  assert.equal(checkout.events.length,1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(checkout.state))),checkout.state);
});

test("an equipped tank first protects itself with armor, not excess bread",()=>{
  const {state,heroId}=prepared("tank",8);
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.deepEqual(preferredShopItemOrder(state.adventurers[0]),
    ["leather-vest","iron-sword","bread","healing-herb"]);
  assert.deepEqual(plan.items.map(line=>line.itemId),["leather-vest"]);
  const purchased=payWantedItems(state,heroId).state.adventurers[0];
  assert.equal(purchased.equipment.armor,"Leather Vest");
  assert.equal(purchased.inventory.bread,0);
});

test("a gravely injured DPS buys actual treatment before a sword, without free healing",()=>{
  const {state,heroId}=prepared("DPS",9,0.40);
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.deepEqual(plan.items.map(line=>line.itemId),["healing-herb"]);
  const checkout=payWantedItems(state,heroId);
  const after=checkout.state.adventurers[0];
  assert.equal(after.health,state.adventurers[0].health);
  assert.equal(after.inventory.healing,1);
  assert.equal(after.equipment.weapon,null);
  assert.equal(after.gold,3);
  assert.equal(checkout.events[0].itemId,"healing-herb");
});

test("scarcity asks Galvik for essentials first, then class gear when supplies are full",()=>{
  const {state,heroId}=prepared("DPS",9);
  const empty={...state,shopEconomy:{...state.shopEconomy,
    slots:state.shopEconomy.slots.map(slot=>({...slot,itemId:null,quantity:0}))}};
  const intent=forecastShoppingIntents(empty).get(heroId)!;
  assert.equal(intent.reason,"unavailable");
  assert.equal(intent.wantedItemId,"bread");
  assert.equal(intent.items.length,0);
  const supplied={...empty,adventurers:empty.adventurers.map(h=>
    h.id===heroId?{...h,inventory:{...h.inventory,bread:2,healing:1}}:h)};
  const gearRequest=forecastShoppingIntents(supplied).get(heroId)!;
  assert.equal(gearRequest.reason,"unavailable");
  assert.equal(gearRequest.wantedItemId,"iron-sword");
});

test("physical held-cart reservation honors changing needs and balances without rerolling",()=>{
  const {state,heroId}=prepared("DPS",25);
  const snapshot=structuredClone(state);
  const first=forecastShoppingIntents(state).get(heroId)!;
  assert.equal(first.items[0].itemId,"iron-sword");
  let current=state;
  for(const item of first.items){
    const next=pickUpShopItem(current,heroId,item.slotId).state;
    assert.notStrictEqual(next,current,
      "Actual physical shelf pickup must be possible in preference order");
    current=next;
  }
  assert.deepEqual(state,snapshot);
  const held=current.shopCarts.find(c=>c.heroId===heroId)!;
  assert(held&&held.lines.length>=2);
  const total=held.lines.reduce((s,line)=>s+line.subtotal,0);
  const previousGold=state.adventurers[0].gold+
    state.shopEconomy.balance;
  const paid=payReservedShopCart(current,heroId).state;
  assert.equal(paid.shopCarts.some(cart=>cart.heroId===heroId),false);
  assert.equal(paid.adventurers[0].gold,state.adventurers[0].gold-total);
  assert.equal(paid.shopEconomy.balance,state.shopEconomy.balance+total);
  assert.equal(paid.adventurers[0].gold+paid.shopEconomy.balance,previousGold);
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);
});
