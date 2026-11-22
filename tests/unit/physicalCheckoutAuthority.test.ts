import {createStockedShopState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {advanceDay,type GameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {transferShelf} from "../../src/game/economy.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {cartTotal,payReservedShopCart,pickUpShopItem}
  from "../../src/game/shopCarts.ts";
import {payWantedItems,reserveWantedItems} from "./physicalCheckoutFixture.ts";

function shopState():GameState{
  const state=createStockedShopState(7351);
  return {...state,adventurers:state.adventurers.map((hero,index)=>
    index===0?{...hero,status:"at-shop" as const,floor:5 as const,
      gold:100,health:Math.max(1,hero.health-20),
      inventory:{...hero.inventory,bread:0,healing:0},
      equipment:{weapon:null,armor:null}}:hero)};
}

test("read-only customer intents can never pay for or reserve hypothetical stock",()=>{
  const state=shopState(),hero=state.adventurers[0];
  const before=structuredClone(state);
  const first=forecastShoppingIntents(state).get(hero.id);
  assert(first?.items.length);
  assert.deepEqual(forecastShoppingIntents(state).get(hero.id),first);
  assert.deepEqual(state,before);
  assert.equal(state.shopCarts.length,0);
  const picked=reserveWantedItems(state,hero.id);
  assert.equal(picked.cart.heroId,hero.id);
  assert.equal(picked.cart.day,state.day);
  assert(picked.cart.lines.every(line=>first.items.some(wanted=>
    wanted.slotId===line.slotId&&wanted.itemId===line.itemId)));
  assert.equal(cartTotal(picked.cart),picked.cart.lines.reduce(
    (sum,line)=>sum+line.quantity*line.subtotal/line.quantity,0));
  assert.equal(picked.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.equal(picked.state.shopEconomy.dailySales.revenue,0);
  assert.deepEqual(picked.state.events,state.events);
  assert.deepEqual(state,before);
});

test("only the physical register pays each held item, exactly once, with conserved gold",()=>{
  const state=shopState(),hero=state.adventurers[0],snapshot=structuredClone(state);
  const {state:paid,held,cart,events}=payWantedItems(state,hero.id);
  assert.deepEqual(state,snapshot);
  assert.equal(events.length,cart.lines.length);
  assert.equal(paid.events.length,state.events.length+cart.lines.length);
  assert(!paid.shopCarts.some(entry=>entry.heroId===hero.id));
  const total=cartTotal(cart);
  const after=paid.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(after.gold,hero.gold-total);
  assert.equal(paid.shopEconomy.balance,state.shopEconomy.balance+total);
  assert.equal(after.gold+paid.shopEconomy.balance,
    hero.gold+state.shopEconomy.balance);
  assert.equal(paid.shopEconomy.dailySales.revenue,total);
  assert.equal(after.inventory.bread,hero.inventory.bread+
    cart.lines.filter(line=>line.itemId==="bread")
      .reduce((n,line)=>n+line.quantity,0));
  assert.equal(after.inventory.healing,hero.inventory.healing+
    cart.lines.filter(line=>line.itemId==="healing-herb")
      .reduce((n,line)=>n+line.quantity,0));
  for(const line of cart.lines){
    const original=state.shopEconomy.slots.find(s=>s.id===line.slotId)!;
    const reserved=held.shopEconomy.slots.find(s=>s.id===line.slotId)!;
    const afterSlot=paid.shopEconomy.slots.find(s=>s.id===line.slotId)!;
    assert.equal(reserved.quantity,original.quantity-line.quantity);
    assert.equal(afterSlot.quantity,reserved.quantity,
      "Payment must never consume already-reserved shelf stock again");
    assert(events.some(e=>e.id==="day-"+state.day+":"+hero.id+
      ":sale:"+line.slotId+":manual"&&e.saleChannel==="manual"&&
      e.revenue===line.subtotal));
  }
  assert.deepEqual(paid.shopEconomy.bag,state.shopEconomy.bag);
  assert.equal(paid.rngState,state.rngState);
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);
  assert.strictEqual(payReservedShopCart(paid,hero.id).state,paid);
  assert.strictEqual(pickUpShopItem(paid,hero.id,cart.lines[0].slotId).state,paid);
});

test("the till refuses missing, stale, unaffordable or forged carts without transfer",()=>{
  const state=shopState(),heroId=state.adventurers[0].id;
  assert.strictEqual(payReservedShopCart(state,heroId).state,state);
  const {state:held,cart}=reserveWantedItems(state,heroId);
  const invalidDay={...held,shopCarts:[{...cart,day:held.day-1}]};
  assert.strictEqual(payReservedShopCart(invalidDay,heroId).state,invalidDay);
  const broke={...held,adventurers:held.adventurers.map(h=>h.id===heroId?{
    ...h,gold:0}:h)};
  assert.strictEqual(payReservedShopCart(broke,heroId).state,broke);
  const forged={...held,shopCarts:[{...cart,lines:cart.lines.map((line,i)=>
    i===0?{...line,subtotal:line.subtotal+11}:line)}]};
  const snapshot=structuredClone(forged);
  assert.throws(()=>payReservedShopCart(forged,heroId),
    /invalid|inconsistent|exceeds|total/i);
  assert.deepEqual(forged,snapshot);
  const payload=createSave(held) as any;
  payload.payload.shopCarts[0].lines[0].subtotal+=11;
  assert.throws(()=>parseSave(JSON.stringify(payload)),/shopCarts/);
});

test("one customer cannot steal reserved bread; a later buyer can use only actual restock",()=>{
  const state=shopState();
  const first=state.adventurers[0],second=state.adventurers[1];
  const ready={...state,
    adventurers:state.adventurers.map(h=>h.id===first.id||h.id===second.id
      ?{...h,status:"at-shop" as const,floor:5 as const,gold:100,
        health:h.stats.maxHealth,
        equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
        inventory:{...h.inventory,bread:0,healing:1}}:h),
    shopEconomy:{...state.shopEconomy,slots:state.shopEconomy.slots.map(slot=>
      slot.id==="shelf-1-slot-2"?{...slot,quantity:1}:
      {...slot,itemId:null,quantity:0})},
  };
  const before=forecastShoppingIntents(ready).get(first.id);
  assert(before?.items.some(line=>line.itemId==="bread"));
  const reserved=pickUpShopItem(ready,first.id,"shelf-1-slot-2").state;
  assert.notStrictEqual(reserved,ready);
  assert.strictEqual(pickUpShopItem(reserved,second.id,"shelf-1-slot-2").state,reserved);
  const paid=payReservedShopCart(reserved,first.id).state;
  assert.equal(paid.adventurers.find(h=>h.id===first.id)!.inventory.bread,1);
  assert.strictEqual(pickUpShopItem(paid,first.id,"shelf-1-slot-2").state,paid);
  const restocked=transferShelf(paid,"shelf-1-slot-2","bread","stock").state;
  assert.notStrictEqual(restocked,paid);
  const next=pickUpShopItem(restocked,second.id,"shelf-1-slot-2").state;
  assert.notStrictEqual(next,restocked);
  const paidAgain=payReservedShopCart(next,second.id).state;
  assert.notStrictEqual(paidAgain,next);
  assert.equal(paidAgain.adventurers.find(h=>h.id===second.id)!.inventory.bread,1);
  assert.equal(paidAgain.adventurers.find(h=>h.id===first.id)!.inventory.bread,1);
  assert.equal(new Set(paidAgain.events.map(e=>e.id)).size,paidAgain.events.length);
  assert.deepEqual(parseSave(JSON.stringify(createSave(paidAgain))),paidAgain);
});

test("sleep never invents a sale or pays an abandoned physical cart",()=>{
  const state=shopState(),hero=state.adventurers[0];
  const picked=reserveWantedItems(state,hero.id).state;
  const transition=advanceDay(picked);
  assert.equal(transition.state.shopCarts.length,0);
  assert.equal(transition.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.equal(transition.state.shopEconomy.dailySales.revenue,0);
  assert(!transition.state.events.some(e=>e.type==="sale"&&e.adventurerId===hero.id));
  assert.deepEqual(parseSave(JSON.stringify(createSave(transition.state))),
    transition.state);
});

test("public GameStore exposes real pickup and exactly one authoritative cashier",()=>{
  const store=new GameStore(shopState()),heroId=store.state.adventurers[0].id;
  assert.equal("quoteCheckout" in store,false);
  assert.equal("checkout" in store,false);
  const wanted=forecastShoppingIntents(store.state).get(heroId)!.items[0];
  const initial=store.state;
  let calls=0;store.subscribe(()=>calls++);
  assert.match(store.pickUpShopItem(heroId,wanted.slotId),/picked up/);
  assert.equal(calls,1);
  assert.equal(store.state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.match(store.payReservedCart(heroId),/paid/);
  assert.equal(calls,2);
  const paid=store.state;
  assert.match(store.payReservedCart(heroId),/no payable cart/);
  assert.equal(calls,2);
  assert.strictEqual(store.state,paid);
});
