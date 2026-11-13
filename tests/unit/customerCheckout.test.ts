import assert from "node:assert/strict";
import test from "node:test";
import { checkoutCustomer, quoteCustomerCheckout, type CheckoutQuote } from "../../src/game/customerCheckout.ts";
import { advanceDay, createGameState, type GameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";
import { transferShelf } from "../../src/game/economy.ts";
import { forecastShoppingIntents } from "../../src/game/shopperIntents.ts";

function shopState():GameState {
  const state=createGameState(7351);
  return {
    ...state,
    adventurers:state.adventurers.map((hero,index)=>index===0
      ? {...hero, status:"at-shop" as const, floor:5 as const,
        gold:100, health:Math.max(1,hero.health-20),
        inventory:{...hero.inventory,bread:0,healing:0},
        equipment:{weapon:null,armor:null}} : hero),
  };
}

test("a quoted cart has stable hero/slot IDs and is a read-only snapshot",()=>{
  const state=shopState();
  const original=structuredClone(state);
  const hero=state.adventurers[0];
  const cart=quoteCustomerCheckout(state,hero.id);
  assert(cart);
  assert.equal(cart.heroId,hero.id);
  assert.equal(cart.day,state.day);
  const forecast=forecastShoppingIntents(state).get(hero.id)!;
  assert.deepEqual(cart.lines,forecast.items);
  assert.equal(cart.total,forecast.total);
  assert(cart.lines.every(line=>state.shopEconomy.slots.some(slot=>
    slot.id===line.slotId&&slot.itemId===line.itemId)));
  assert.deepEqual(state,original);
  assert.deepEqual(quoteCustomerCheckout(state,hero.id),cart);
});

test("checkout commits the entire cart exactly once with conserved gold and a valid save",()=>{
  const state=shopState();
  const hero=state.adventurers[0];
  const cart=quoteCustomerCheckout(state,hero.id)!;
  const previous=structuredClone(state);
  const result=checkoutCustomer(state,cart);
  assert.notStrictEqual(result.state,state);
  assert.equal(result.events.length,cart.lines.length);
  assert.equal(result.state.events.length,state.events.length+cart.lines.length);
  assert.deepEqual(state,previous);
  const nextHero=result.state.adventurers[0];
  const boughtBread=cart.lines.filter(line=>line.itemId==="bread")
    .reduce((sum,line)=>sum+line.quantity,0);
  const boughtHealing=cart.lines.filter(line=>line.itemId==="healing-herb")
    .reduce((sum,line)=>sum+line.quantity,0);
  assert.equal(nextHero.gold,hero.gold-cart.total);
  assert.equal(nextHero.inventory.bread,hero.inventory.bread+boughtBread);
  assert.equal(nextHero.inventory.healing,hero.inventory.healing+boughtHealing);
  assert.equal(result.state.shopEconomy.balance,state.shopEconomy.balance+cart.total);
  assert.equal(nextHero.gold+result.state.shopEconomy.balance,
    hero.gold+state.shopEconomy.balance);
  assert.equal(result.state.shopEconomy.dailySales.revenue,cart.total);
  for(const line of cart.lines){
    const before=state.shopEconomy.slots.find(slot=>slot.id===line.slotId)!;
    const after=result.state.shopEconomy.slots.find(slot=>slot.id===line.slotId)!;
    assert.equal(after.quantity,before.quantity-line.quantity);
    assert(result.events.some(event=>
      event.id==="day-"+state.day+":"+hero.id+":sale:"+line.slotId &&
      event.revenue===line.subtotal));
  }
  assert.deepEqual(result.state.shopEconomy.bag,state.shopEconomy.bag);
  assert.equal(result.state.rngState,state.rngState);
  assert.deepEqual(parseSave(JSON.stringify(createSave(result.state))),result.state);
  assert.equal(quoteCustomerCheckout(result.state,hero.id),null);
  const duplicate=checkoutCustomer(result.state,cart);
  assert.strictEqual(duplicate.state,result.state);
  assert.equal(duplicate.events.length,0);
  assert.match(duplicate.message,/already paid today/);
});

test("stale quotes and forged prices cannot spend anything",()=>{
  const state=shopState();
  const cart=quoteCustomerCheckout(state,state.adventurers[0].id)!;
  const staleVariants:CheckoutQuote[]=[
    {...cart,day:cart.day-1},
    {...cart,total:cart.total+1},
    {...cart,lines:cart.lines.slice(1)},
    {...cart,lines:cart.lines.map((line,i)=>i===0
      ? {...line,subtotal:line.subtotal+8}:line)},
    {...cart,lines:cart.lines.map((line,i)=>i===0
      ? {...line,quantity:line.quantity+1}:line)},
    {...cart,heroId:state.adventurers[1].id},
  ];
  const oneLess=transferShelf(state,"shelf-1-slot-2","bread","remove").state;
  const nowEmpty=transferShelf(oneLess,"shelf-1-slot-2","bread","remove").state;
  assert.notStrictEqual(nowEmpty,state);
  assert.strictEqual(checkoutCustomer(nowEmpty,cart).state,nowEmpty,
    "Removing a stocked item invalidates the old quote.");
  const noMoney={...state,adventurers:state.adventurers.map((hero,i)=>
    i===0?{...hero,gold:0}:hero)};
  assert.strictEqual(checkoutCustomer(noMoney,cart).state,noMoney);
  for(const forged of staleVariants){
    const attempt=checkoutCustomer(state,forged);
    assert.strictEqual(attempt.state,state);
    assert.deepEqual(attempt.events,[]);
  }
});

test("two competing customers cannot both pay from depleted stock",()=>{
  const state=shopState();
  const customers=state.adventurers.slice(0,2);
  const a=quoteCustomerCheckout(state,customers[0].id)!;
  const b=quoteCustomerCheckout(state,customers[1].id);
  const completed=checkoutCustomer(state,a).state;
  if(b){
    const attempt=checkoutCustomer(completed,b);
    if(attempt.state!==completed){
      // A second quote is not stale if enough stock was left and its original
      // requirements still match. Only actual overselling is forbidden.
      assert.equal(attempt.state.shopEconomy.balance-completed.shopEconomy.balance,
        b.total);
      assert(attempt.state.shopEconomy.slots.every(slot=>slot.quantity>=0));
      assert.equal(new Set(attempt.state.events.map(event=>event.id)).size,
        attempt.state.events.length);
    }
  }
  const updated=quoteCustomerCheckout(completed,customers[1].id);
  if(updated){
    const fresh=checkoutCustomer(completed,updated);
    assert.equal(fresh.state.shopEconomy.balance-completed.shopEconomy.balance,
      updated.total);
  }
});

test("manual sale is not replayed automatically for the same hero at the next day tick",()=>{
  const state=shopState();
  const hero=state.adventurers[0];
  const cart=quoteCustomerCheckout(state,hero.id)!;
  const checked=checkoutCustomer(state,cart).state;
  const afterDay=advanceDay(checked);
  const nextDaySales=afterDay.events.filter(event=>
    event.type==="sale"&&event.adventurerId===hero.id);
  assert.equal(nextDaySales.length,0);
  const allIds=afterDay.state.events.map(event=>event.id);
  assert.equal(new Set(allIds).size,allIds.length);
  assert.deepEqual(parseSave(JSON.stringify(createSave(afterDay.state))),
    afterDay.state);
});

test("GameStore exposes a pure preview and commits only once after validation",()=>{
  const store=new GameStore(shopState());
  const quote=store.quoteCheckout(store.state.adventurers[0].id);
  assert(quote);
  const before=store.state;
  let notifies=0;
  store.subscribe(()=>notifies++);
  assert.strictEqual(store.state,before);
  const msg=store.checkout(quote);
  assert.match(msg,/Paid .*g for/);
  assert.equal(notifies,1);
  const now=store.state;
  assert.match(store.checkout(quote),/already paid today/);
  assert.strictEqual(store.state,now);
  assert.equal(notifies,1);
});

test("Copilot regression: a customer paid once cannot claim freshly restocked bread twice",()=>{
  const state=shopState();
  const people=state.adventurers.map((person,i)=>i<2?{
    ...person,status:"at-shop" as const,floor:5 as const,
    gold:100,inventory:{...person.inventory,bread:0,healing:1},
    health:person.stats.maxHealth,equipment:{weapon:null,armor:null},
  }:person);
  // Exactly one bread is available before the first transaction.
  const scarce={...state,adventurers:people,shopEconomy:{
    ...state.shopEconomy,slots:state.shopEconomy.slots.map(slot=>
      slot.id==="shelf-1-slot-2"?{...slot,quantity:1}:slot),
  }};
  const first=quoteCustomerCheckout(scarce,people[0].id);
  assert(first);
  assert.equal(first.lines.find(line=>line.itemId==="bread")?.quantity,1);
  const paid=checkoutCustomer(scarce,first).state;
  assert.equal(paid.adventurers[0].inventory.bread,1,
    "Paid hero still needs another meal but cannot pay again this day");
  assert.equal(quoteCustomerCheckout(paid,people[0].id),null);
  const restocked=transferShelf(paid,"shelf-1-slot-2","bread","stock").state;
  const second=quoteCustomerCheckout(restocked,people[1].id);
  assert(second,"The unpaid buyer can request the newly stocked bread");
  assert.equal(second.lines.find(line=>line.itemId==="bread")?.quantity,1);
  const booked=checkoutCustomer(restocked,second);
  assert.equal(booked.state.adventurers[1].inventory.bread,1);
  assert.equal(booked.state.adventurers[0].inventory.bread,1);
  assert.equal(booked.state.shopEconomy.slots.find(slot=>
    slot.id==="shelf-1-slot-2")?.quantity,0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(booked.state))),
    booked.state);
});
