import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {advanceWorldUntil} from "../../src/game/worldClock.ts";
import {clearResolvedShopRequests,commitShopRequestEvent,requestRemainingTicks,
  startShopRequest} from "../../src/game/shopRuntime.ts";
import {createStockedShopState} from "./shopFixtures.ts";

function waitingShop(){
  const base=createStockedShopState(7351);
  const buyer=base.adventurers[0];
  const state={
    ...base,
    adventurers:base.adventurers.map((hero,i)=>i===0
      ?{...hero,status:"at-shop" as const,floor:5 as const,gold:100,
        inventory:{...hero.inventory,bread:0,healing:0},equipment:{weapon:null,armor:null}}
      :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
    shopEconomy:{...base.shopEconomy,
      slots:base.shopEconomy.slots.map(slot=>({...slot,itemId:null,quantity:0}))},
  };
  const plan=forecastShoppingIntents(state).get(buyer.id)!;
  assert.equal(plan.reason,"unavailable");
  assert.equal(plan.wantedItemId,"bread");
  return {state,buyerId:buyer.id};
}

test("live shop request is unique and commits exactly one real angry walkout at world tick",()=>{
  const {state,buyerId}=waitingShop();
  const store=new GameStore(state);
  const due=store.startShopRequest(buyerId,"bread","unavailable");
  assert.equal(due,60);
  assert.equal(store.startShopRequest(buyerId,"bread","unavailable"),due);
  assert.equal(store.state.shopRequests.length,1);
  assert.equal(store.state.worldClock.pending.length,1);
  store.advanceWorldTime(59);
  assert.equal(store.state.shopRequests.length,1);
  assert.equal(store.shopRequestRemaining(buyerId),1);
  const beforeBalance=store.state.shopEconomy.balance;
  const beforeGold=store.state.adventurers.find(h=>h.id===buyerId)!.gold;
  store.advanceWorldTime(1);
  assert.equal(store.state.worldClock.tick,60);
  assert.equal(store.state.shopRequests.length,0);
  assert.equal(store.state.worldClock.pending.length,0);
  const events=store.state.events.filter(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId);
  assert.equal(events.length,1);
  assert.equal(events[0].worldTick,60);
  assert.equal(events[0].shopReason,"unavailable");
  assert.equal(store.state.adventurers.find(h=>h.id===buyerId)!.status,"returning");
  assert.equal(store.state.shopEconomy.balance,beforeBalance);
  assert.equal(store.state.adventurers.find(h=>h.id===buyerId)!.gold,beforeGold);
  assert.equal(store.state.events.filter(e=>e.type==="sale"&&e.adventurerId===buyerId).length,0);
  store.advanceWorldTime(100);
  assert.equal(store.state.events.filter(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId).length,1);
});

test("request countdown saves and continues after reload without deadline extension",()=>{
  const {state,buyerId}=waitingShop();
  const store=new GameStore(state);
  store.startShopRequest(buyerId,"bread","unavailable");
  store.advanceWorldTime(17);
  const resumed=parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(requestRemainingTicks(resumed,buyerId),43);
  const a=new GameStore(store.state),b=new GameStore(resumed);
  a.advanceWorldTime(43);
  b.advanceWorldTime(43);
  assert.deepEqual(a.state,b.state);
  assert.equal(a.state.events.filter(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId).length,1);
});

test("real restocking cancels request and its scheduled expiry, with no phantom walkout",()=>{
  const {state,buyerId}=waitingShop();
  const store=new GameStore(state);
  store.startShopRequest(buyerId,"bread","unavailable");
  assert.equal(store.state.shopRequests.length,1);
  const target=store.state.shopEconomy.slots.find(slot=>slot.index===1)!;
  const placed=store.transfer(target.id,"bread","stock");
  assert.match(placed,/Placed/);
  assert.equal(store.state.shopRequests.length,0);
  assert.equal(store.state.worldClock.pending.length,0);
  store.advanceWorldTime(90);
  assert.equal(store.state.events.some(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId),false);
});

test("day closure fast-forwards outstanding requests once and clears shop-only future events",()=>{
  const {state,buyerId}=waitingShop();
  const store=new GameStore(state);
  store.startShopRequest(buyerId,"bread","unavailable");
  store.endDay();
  assert.equal(store.state.day,2);
  assert.equal(store.state.worldClock.tick,1440);
  assert.equal(store.state.shopRequests.length,0);
  assert.equal(store.state.worldClock.pending.length,0);
  assert.equal(store.state.events.filter(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId).length,1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  store.advanceWorldTime(200);
  assert.equal(store.state.events.filter(e=>e.type==="shop-walkout"&&e.adventurerId===buyerId).length,1);
});

test("forged or orphaned shop request queues fail strict save validation",()=>{
  const {state,buyerId}=waitingShop();
  const valid=startShopRequest(state,buyerId,"bread","unavailable");
  assert.equal(valid.shopRequests.length,1);
  const source=createSave(valid);
  const tamper=(fn:(s:any)=>void,regex:RegExp)=>{
    const envelope=structuredClone(source) as any;
    fn(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),regex);
  };
  tamper(s=>{s.shopRequests[0].eventId="clock-999";},/eventId/);
  tamper(s=>{s.shopRequests[0].dueTick=100000;},/dueTick/);
  tamper(s=>{s.shopRequests[0].itemId="healing-herb";},/itemId/);
  tamper(s=>{s.shopRequests.push(s.shopRequests[0]);},/unique/);
  tamper(s=>{s.shopRequests=[];},/orphaned visitor/);
  assert.deepEqual(clearResolvedShopRequests(valid),valid);
  assert.throws(()=>advanceWorldUntil(valid,61,(_s,event)=>{
    return commitShopRequestEvent({...valid,shopRequests:[]},event);
  }),/Orphaned/);
});
