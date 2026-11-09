import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, SIMULATION_VERSION, type GameState } from "../../src/game/gameState.ts";
import { pickUpShopItem, returnShopCart, cartTotal, settleHeldShopCarts, payReservedShopCart } from "../../src/game/shopCarts.ts";
import { forecastShoppingIntents } from "../../src/game/shopperIntents.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { transferShelf } from "../../src/game/economy.ts";
import { GameStore } from "../../src/game/gameStore.ts";
import { quoteCustomerCheckout } from "../../src/game/customerCheckout.ts";

function customers():GameState {
  const base=createGameState(7351);
  return {...base,adventurers:base.adventurers.map((hero,index)=>
    index<2 ? {...hero, status:"at-shop" as const, floor:5 as const,
      gold:index===0?100:8, health:index===0?Math.max(1,hero.health-20):hero.health,
      inventory:{...hero.inventory,food:0,healing:0},
      equipment:{weapon:null,armor:null}} :hero)};
}
function slotQuantity(state:GameState,slotId:string) {
  return state.shopEconomy.slots.find(slot=>slot.id===slotId)!.quantity;
}
test("pickup is durable, removes only physical shelf stock and never charges before checkout",()=>{
  const state=customers();
  assert.equal(SIMULATION_VERSION,10);
  const hero=state.adventurers[0];
  const plan=forecastShoppingIntents(state).get(hero.id)!;
  const needed=plan.items[0];
  assert(needed);
  const copy=structuredClone(state);
  const picked=pickUpShopItem(state,hero.id,needed.slotId);
  assert.notStrictEqual(picked.state,state);
  assert.match(picked.message,/unpaid/);
  assert.deepEqual(state,copy);
  assert.equal(picked.state.shopCarts.length,1);
  assert.deepEqual(picked.state.shopCarts[0].lines,[needed]);
  assert.equal(cartTotal(picked.state.shopCarts[0]),needed.subtotal);
  assert.equal(slotQuantity(picked.state,needed.slotId),
    slotQuantity(state,needed.slotId)-needed.quantity);
  assert.strictEqual(picked.state.adventurers,state.adventurers);
  assert.equal(picked.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.equal(picked.state.shopEconomy.dailySales.revenue,0);
  assert.deepEqual(picked.state.events,state.events);
  assert.equal(picked.state.rngState,state.rngState);
  assert.deepEqual(parseSave(JSON.stringify(createSave(picked.state))),picked.state);
  assert.equal(quoteCustomerCheckout(picked.state,hero.id),null,
    "The uncharged carried goods cannot be double-charged by legacy checkout.");
});
test("cannot reserve the same slot twice, steal held stock or buy an unavailable item",()=>{
  const state=customers();
  const hero=state.adventurers[0];
  const desired=forecastShoppingIntents(state).get(hero.id)!.items[0];
  const after=pickUpShopItem(state,hero.id,desired.slotId).state;
  assert.strictEqual(pickUpShopItem(after,hero.id,desired.slotId).state,after);
  assert.strictEqual(transferShelf(after,desired.slotId,desired.itemId,"stock").state,after);
  assert.strictEqual(transferShelf(after,desired.slotId,desired.itemId,"remove").state,after);
  assert.strictEqual(pickUpShopItem(after,hero.id,"nonexistent").state,after);
  const plans=forecastShoppingIntents(after);
  assert.equal(plans.get(hero.id)?.items.some(item=>item.slotId===desired.slotId),false,
    "The reserved food already satisfies its hero's virtual hunger.");
  assert(plans.get(state.adventurers[1].id));
});
test("multiple items accumulate and can be returned without money or inventory leaks",()=>{
  const state=customers();
  const hero=state.adventurers[0];
  let latest=state;
  const pickedIds:string[]=[];
  for(let i=0;i<3;i++){
    const item=forecastShoppingIntents(latest).get(hero.id)?.items[0];
    if(!item)break;
    const result=pickUpShopItem(latest,hero.id,item.slotId);
    assert.notStrictEqual(result.state,latest);
    latest=result.state;
    pickedIds.push(item.slotId);
  }
  assert(pickedIds.length>=2);
  assert.equal(latest.shopCarts[0].lines.length,pickedIds.length);
  const before=structuredClone(latest);
  const returned=returnShopCart(latest,hero.id);
  assert.equal(returned.state.shopCarts.length,0);
  assert.deepEqual(returned.state.shopEconomy.slots,state.shopEconomy.slots);
  assert.equal(returned.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.deepEqual(returned.state.adventurers,state.adventurers);
  assert.deepEqual(latest,before);
  assert.deepEqual(parseSave(JSON.stringify(createSave(returned.state))),returned.state);
});
test("transition settles held goods once, records day+1 receipts and preserves existing dungeon RNG",()=>{
  const state=customers();
  const first=state.adventurers[0];
  const firstLine=forecastShoppingIntents(state).get(first.id)!.items[0];
  const reserved=pickUpShopItem(state,first.id,firstLine.slotId).state;
  const preview=settleHeldShopCarts(reserved,state.day+1);
  assert.equal(preview.state.shopCarts.length,0);
  assert.equal(preview.events.length,1);
  assert.equal(preview.events[0].day,2);
  assert.equal(preview.events[0].id,"day-2:"+first.id+":sale:"+firstLine.slotId);
  assert.equal(preview.state.shopEconomy.balance,
    reserved.shopEconomy.balance+firstLine.subtotal);
  assert.equal(preview.state.adventurers[0].gold,first.gold-firstLine.subtotal);
  assert.deepEqual(reserved.shopCarts[0].lines,[firstLine]);
  const transition=advanceDay(reserved);
  assert.equal(transition.state.shopCarts.length,0);
  assert.equal(transition.state.shopEconomy.dailySales.day,2);
  assert(transition.state.shopEconomy.dailySales.revenue>=firstLine.subtotal);
  assert.equal(transition.events.filter(event=>event.type==="sale"&&
    event.adventurerId===first.id).length,1,
    "The picked hero should not purchase a second automatic cart.");
  const ids=transition.state.events.map(event=>event.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(parseSave(JSON.stringify(createSave(transition.state))),transition.state);
});
test("unpaid carts migrate from v9 as empty, preserving furniture, heroes and receipts",()=>{
  const state=advanceDay(createGameState(1307)).state;
  const envelope=structuredClone(createSave(state)) as any;
  envelope.simulationVersion=9;
  envelope.payload.simulationVersion=9;
  delete envelope.payload.shopCarts;
  const migrated=parseSave(JSON.stringify(envelope));
  assert.equal(migrated.simulationVersion,10);
  assert.deepEqual(migrated.shopCarts,[]);
  assert.deepEqual(migrated.shopLayout,state.shopLayout);
  assert.deepEqual(migrated.shopEconomy,state.shopEconomy);
  assert.deepEqual(migrated.adventurers,state.adventurers);
  assert.deepEqual(migrated.events,state.events);
  assert.equal(migrated.rngState,state.rngState);
  assert.deepEqual(parseSave(JSON.stringify(createSave(migrated))),migrated);
});
test("strict campaign validation rejects forged or excessive held cart stock",()=>{
  const state=customers();
  const hero=state.adventurers[0];
  const plan=forecastShoppingIntents(state).get(hero.id)!.items[0];
  const picked=pickUpShopItem(state,hero.id,plan.slotId).state;
  const cases: Array<[string,(data:any)=>void]>=[
    ["shopCarts",data=>{delete data.shopCarts;}],
    ["shopCarts",data=>{data.shopCarts[0].day=9;}],
    ["shopCarts",data=>{data.shopCarts[0].heroId="missing";}],
    ["shopCarts",data=>{data.shopCarts[0].lines[0].quantity=9;}],
    ["shopCarts",data=>{data.shopCarts[0].lines[0].subtotal=1;}],
    ["shopCarts",data=>{data.shopCarts[0].lines[0].slotId="invented";}],
    ["shopCarts",data=>{data.shopCarts.push(structuredClone(data.shopCarts[0]));}],
    ["shopCarts",data=>{data.shopCarts[0].lines.push(structuredClone(data.shopCarts[0].lines[0]));}],
    ["shopCarts",data=>{data.shopCarts[0].lines[0].itemId="iron-ore";}],
  ];
  for(const [field,mutate] of cases){
    const envelope=structuredClone(createSave(picked)) as any;
    mutate(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),new RegExp(field));
  }
});
test("GameStore emits one update per real pickup and preserves carts over export",()=>{
  const store=new GameStore(customers());
  let notifications=0;
  store.subscribe(()=>notifications++);
  const heroId=store.state.adventurers[0].id;
  const item=forecastShoppingIntents(store.state).get(heroId)!.items[0];
  store.pickUpShopItem(heroId,item.slotId);
  assert.equal(notifications,1);
  store.pickUpShopItem(heroId,item.slotId);
  assert.equal(notifications,1);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.shopCarts,store.state.shopCarts);
  store.endDay();
  assert.equal(store.state.shopCarts.length,0);
  assert.equal(notifications,2);
});

test("Copilot regression: previous day's reserved receipt never blocks another shop visit",()=>{
  const state=customers();
  const hero=state.adventurers[0];
  const first=forecastShoppingIntents(state).get(hero.id)!.items[0];
  const reserved=pickUpShopItem(state,hero.id,first.slotId).state;
  const day2=advanceDay(reserved).state;
  const receipt=day2.events.find(event=>event.type==="sale"&&
    event.saleChannel==="reserved"&&event.adventurerId===hero.id);
  assert(receipt);
  assert.equal(receipt.day,2);
  // Simulate a subsequent shop visit with empty supplies and fresh stock.
  const visiting={...day2,adventurers:day2.adventurers.map(h=>h.id===hero.id
    ? {...h,status:"at-shop" as const,floor:5 as const,
      inventory:{...h.inventory,food:0},shopStayDays:0}
    :h)};
  const slot=visiting.shopEconomy.slots.find(x=>x.id===first.slotId)!;
  const stocked={...visiting,shopEconomy:{...visiting.shopEconomy,
    slots:visiting.shopEconomy.slots.map(x=>x.id===first.slotId?
      {...x,itemId:"bread" as const,quantity:Math.max(2,slot.quantity)}:x)}};
  const next=forecastShoppingIntents(stocked).get(hero.id);
  assert(next?.items.some(line=>line.itemId==="bread"),
    "Day 2 shop forecasts should not exclude the previous checkout at start of Day 2");
  const pick=pickUpShopItem(stocked,hero.id,first.slotId);
  assert.notStrictEqual(pick.state,stocked);
});
test("Copilot regression: imported cart cannot also have a manual same-day receipt",()=>{
  const state=customers();
  const hero=state.adventurers[0];
  const interest=forecastShoppingIntents(state).get(hero.id)!.items[0];
  const picked=pickUpShopItem(state,hero.id,interest.slotId).state;
  const forged={
    ...picked,
    events:[...picked.events,{
      id:"day-"+state.day+":"+hero.id+":sale:"+interest.slotId,
      day:state.day,
      adventurerId:hero.id,
      type:"sale" as const,
      saleChannel:"manual" as const,
      itemId:interest.itemId,quantity:interest.quantity,
      revenue:interest.subtotal,message:"Duplicated payment",
    }],
  };
  // construct the envelope without createSave (that should also reject it)
  const envelope=structuredClone(createSave(picked)) as any;
  envelope.payload.events=forged.events;
  assert.throws(()=>parseSave(JSON.stringify(envelope)),/shopCarts.*already paid/);
  assert.throws(()=>createSave(forged),/shopCarts.*already paid/);
});

test("staffed checkout produces save-safe manual receipts, pays once and leaves other carts",()=>{
  const initial=customers();
  const first=initial.adventurers[0];
  const wanted=forecastShoppingIntents(initial).get(first.id)!.items[0];
  const reserved=pickUpShopItem(initial,first.id,wanted.slotId).state;
  const result=payReservedShopCart(reserved,first.id);
  assert.notStrictEqual(result.state,reserved);
  assert.equal(result.state.shopCarts.length,0);
  assert.equal(result.state.shopEconomy.balance,
    reserved.shopEconomy.balance+wanted.subtotal);
  const receipt=result.state.events.find(event=>event.type==="sale" &&
    event.adventurerId===first.id);
  assert(receipt);
  assert.equal(receipt.saleChannel,"manual");
  assert.match(String(receipt.id),/:manual$/);
  assert.deepEqual(parseSave(JSON.stringify(createSave(result.state))),result.state);
  assert.strictEqual(payReservedShopCart(result.state,first.id).state,result.state);
  assert.strictEqual(pickUpShopItem(result.state,first.id,wanted.slotId).state,result.state);
});

test("perfect cashier timing transfers a real 10% tip and survives save roundtrip",()=>{
  const initial=customers();
  const hero=initial.adventurers[0];
  let state=initial;
  for(let i=0;i<3;i++){
    const next=forecastShoppingIntents(state).get(hero.id)?.items[0];
    if(!next)break;
    const picked=pickUpShopItem(state,hero.id,next.slotId);
    if(picked.state===state)break;
    state=picked.state;
  }
  const total=cartTotal(state.shopCarts[0]);
  const tip=Math.floor(total/10);
  const paid=payReservedShopCart(state,hero.id,true).state;
  assert.equal(paid.adventurers[0].gold,hero.gold-total-tip);
  assert.equal(paid.shopEconomy.balance,state.shopEconomy.balance+total+tip);
  assert.equal(paid.shopEconomy.dailySales.revenue,total+tip);
  assert.equal(paid.events.filter(event=>event.type==="tip").length,tip>0?1:0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);
  assert.strictEqual(payReservedShopCart(paid,hero.id,true).state,paid);
});
test("insufficient extra gold does not create a tip or overdraw customer",()=>{
  const initial=customers();
  const hero=initial.adventurers[0];
  const wanted=forecastShoppingIntents(initial).get(hero.id)!.items[0];
  const reserved=pickUpShopItem(initial,hero.id,wanted.slotId).state;
  const constrained={...reserved,adventurers:reserved.adventurers.map(person=>
    person.id===hero.id?{...person,gold:cartTotal(reserved.shopCarts[0])}:person)};
  const paid=payReservedShopCart(constrained,hero.id,true).state;
  assert.equal(paid.adventurers[0].gold,0);
  assert.equal(paid.events.filter(event=>event.type==="tip").length,0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);
});
