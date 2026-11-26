import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {createStockedShopState} from "./shopFixtures.ts";
import {advanceEmployees,chooseEmployeeJob,employeeOpportunities,EMPLOYEE_DEFINITIONS,
  EMPLOYEE_WORK_SPEED,EMPLOYEE_CHECKOUT_TICKS,employeeCashierOpportunity,employeeCharityOpportunity,type EmployeeJob} from "../../src/game/employees.ts";
import {employeeFloorY,employeeRoute,employeeSegmentClear,employeeStoragePoint,EMPLOYEE_HOME} from "../../src/game/employeeNavigation.ts";
import {counterDockPoint} from "../../src/game/shopLayout.ts";
import {CELLAR_FLOOR_Y} from "../../src/game/cellarRoom.ts";
import {availableBagUnits,discardBag,transferShelf} from "../../src/game/economy.ts";
import {pickUpShopItem,payReservedShopCart,cartTotal} from "../../src/game/shopCarts.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {manuallyPaidVisitors} from "../../src/game/npcVisitors.ts";
import type {ShopTrafficActor} from "../../src/game/shopTraffic.ts";
import {frontCheckoutPoint} from "../../src/game/checkoutQueue.ts";
import {restockWaitingPositions} from "../../src/game/restockWaitingPlaces.ts";
import {issueShopCredit} from "../../src/game/shopCredit.ts";

test("Tettel begins peacefully in the cellar, with no autonomous transactions enabled",()=>{
  const state=createGameState(7351);
  assert.equal(state.employees.length,1);
  const t=state.employees[0];
  assert.equal(t.id,"tettel");
  assert.deepEqual({x:t.x,z:t.z},EMPLOYEE_HOME);
  assert.equal(employeeFloorY(t.z),CELLAR_FLOOR_Y);
  assert.equal(EMPLOYEE_DEFINITIONS[0].earnsTips,false);
  assert.deepEqual(t.priorities,{cashier:0,restocking:0,charity:0});
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
});
test("priorities are saved, disabled tasks ignored and equal-priority task types favor oldest work",()=>{
  const store=new GameStore(createGameState(7351));
  assert(store.setEmployeePriority("tettel","restocking",5));
  assert(store.setEmployeePriority("tettel","cashier",1));
  assert(!store.setEmployeePriority("tettel","cashier",10));
  assert(!store.setEmployeePriority("unknown","cashier",1));
  const jobs:EmployeeJob[]=[
    {task:"restocking",targetId:"shelf-1-slot-1",point:{x:2,z:0}},
    {task:"cashier",targetId:"adventurer-1",point:{x:1,z:0}},
    {task:"charity",targetId:"adventurer-2",point:{x:3,z:0}},
  ];
  const e=store.state.employees[0];
  assert.equal(chooseEmployeeJob(e,jobs,100).job?.task,"cashier");
  assert.equal(chooseEmployeeJob(e,jobs.filter(j=>j.task!=="cashier"),100).job?.task,"restocking");
  const same={...e,priorities:{...e.priorities,cashier:5 as const},
    pendingSince:{...e.pendingSince,restocking:10,cashier:20}};
  assert.equal(chooseEmployeeJob(same,jobs,100).job?.task,"restocking");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  const invalid=structuredClone(createSave(store.state)) as any;
  invalid.payload.employees[0].priorities.cashier=10;
  assert.throws(()=>parseSave(JSON.stringify(invalid)),/employees/);
});
test("the existing connected route crosses the physical ramp only when the portrait is open",()=>{
  const closed=createGameState(7351);
  const target=counterDockPoint(closed.shopLayout,"staff");
  assert.equal(employeeRoute(closed,EMPLOYEE_HOME,target),null);
  const open={...closed,cellarDoorOpen:true};
  const route=employeeRoute(open,EMPLOYEE_HOME,target);
  assert(route,"A default cellar employee must be able to reach the real staff dock");
  let prior=EMPLOYEE_HOME;
  for(const p of route.waypoints){
    assert(employeeSegmentClear(open,prior,p));prior=p;
  }
  assert.deepEqual(prior,target);
  assert(employeeFloorY(-16.1)<0&&employeeFloorY(-16.1)>CELLAR_FLOOR_Y);
  assert.equal(employeeFloorY(-6.5),0);
});
const step=(s:GameState,manualCashierActive=false):GameState=>{
  const tick=s.worldClock.tick+1;
  return advanceEmployees({...s,worldClock:{...s.worldClock,tick},
    shopTraffic:{...s.shopTraffic,tick}},manualCashierActive);
};
test("Tettel reserves real stock, physically collects at the chest and delivers through the canonical shelf transfer",()=>{
  const initial=createStockedShopState(7351);
  const store=new GameStore({...initial,cellarDoorOpen:true});
  store.setEmployeePriority("tettel","restocking",1);
  let state=store.state;
  const opportunity=employeeOpportunities(state).find(j=>j.task==="restocking");
  assert(opportunity);
  const slot=state.shopEconomy.slots.find(s=>s.id===opportunity.targetId)!;
  assert(slot.itemId);
  const itemId=slot.itemId;
  const expected=Math.min(slot.capacity-slot.quantity,initial.shopEconomy.bag[itemId]);
  let prior=state.employees[0],sawRamp=false,sawPickup=false;
  for(let i=0;i<1800&&state.shopEconomy.bag[itemId]===initial.shopEconomy.bag[itemId];i++){
    state=step(state);
    const next=state.employees[0];
    assert(Math.hypot(next.x-prior.x,next.z-prior.z)<=EMPLOYEE_WORK_SPEED*.05+1e-8);
    assert(employeeSegmentClear(state,prior,next));
    sawRamp||=next.z>-20.1&&next.z<-12.1;
    if(!sawPickup&&next.restock?.stage==="deliver"){
      const dock=employeeStoragePoint(state)!;
      assert(Math.hypot(next.x-dock.x,next.z-dock.z)<.08);
      sawPickup=true;
      assert.equal(state.shopEconomy.bag[itemId],initial.shopEconomy.bag[itemId]);
      assert.equal(availableBagUnits(state,itemId),initial.shopEconomy.bag[itemId]-expected);
      const saved=parseSave(JSON.stringify(createSave(state)));
      assert.deepEqual(step(saved),step(state),"reload preserves cargo and route");
    }
    prior=next;
  }
  assert(sawPickup);assert(sawRamp);
  assert.equal(state.shopEconomy.bag[itemId],initial.shopEconomy.bag[itemId]-expected);
  assert.equal(state.shopEconomy.slots.find(s=>s.id===slot.id)?.quantity,slot.quantity+expected);
  assert.equal(state.employees[0].restock,null);
  assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.deepEqual(state.adventurers,initial.adventurers);
  assert.deepEqual(state.events,initial.events);
  const configured=new GameStore(state);
  configured.setEmployeePriority("tettel","restocking",0);
  state=configured.state;
  for(let i=0;i<1500&&Math.hypot(state.employees[0].x-EMPLOYEE_HOME.x,state.employees[0].z-EMPLOYEE_HOME.z)>=.08;i++)
    state=step(state);
  assert.equal(state.employees[0].job,null);
  assert(Math.hypot(state.employees[0].x-EMPLOYEE_HOME.x,state.employees[0].z-EMPLOYEE_HOME.z)<.08);
});
test("manual takeover releases an uncollected claim; carried goods cannot be consumed twice",()=>{
  const initial=createStockedShopState(7351);
  const store=new GameStore({...initial,cellarDoorOpen:true});
  const slot=store.state.shopEconomy.slots.find(s=>s.itemId===null)!;
  store.assignShelfItem(slot.id,"bread");
  store.setEmployeePriority("tettel","restocking",1);
  const claimed=step(store.state);
  const claim=claimed.employees[0].restock!;
  assert.equal(claim.slotId,slot.id);assert.equal(claim.stage,"collect");
  assert.equal(availableBagUnits(claimed,"bread"),0);
  assert.strictEqual(discardBag(claimed,"bread").state,claimed);
  assert.strictEqual(transferShelf(claimed,slot.id,"bread","stock").state,claimed);
  const bad=structuredClone(createSave(claimed)) as any;
  bad.payload.employees[0].restock.units=5;
  assert.throws(()=>parseSave(JSON.stringify(bad)),/reserved cargo/);
  const manual=new GameStore(claimed);
  assert.match(manual.transfer(slot.id,"bread","stock",2),/^Placed/);
  assert.equal(manual.state.employees[0].restock,null);
  assert.equal(manual.state.shopEconomy.bag.bread,0);
  let carried=claimed;
  for(let i=0;i<500&&carried.employees[0].restock?.stage!=="deliver";i++)carried=step(carried);
  assert.equal(carried.employees[0].restock?.stage,"deliver");
  assert.strictEqual(discardBag(carried,"bread").state,carried);
  const cancelled=new GameStore(carried);
  cancelled.assignShelfItem(slot.id,null);
  cancelled.setEmployeePriority("tettel","restocking",0);
  let returned=cancelled.state;
  for(let i=0;i<1500&&returned.employees[0].restock;i++)returned=step(returned);
  assert.equal(returned.employees[0].restock,null);
  assert.equal(availableBagUnits(returned,"bread"),initial.shopEconomy.bag.bread);
  assert.equal(returned.shopEconomy.slots.find(s=>s.id===slot.id)?.itemId,null);
  assert.equal(returned.shopEconomy.slots.find(s=>s.id===slot.id)?.quantity,0);
});

test("assigned empty shelves offer real restocking work only when matching stock exists",()=>{
  const store=new GameStore(createStockedShopState(7351));
  const slot=store.state.shopEconomy.slots.find(s=>s.itemId===null)!;
  assert(!employeeOpportunities(store.state).some(j=>j.targetId===slot.id));
  store.assignShelfItem(slot.id,"forged-spear");
  assert(!employeeOpportunities(store.state).some(j=>j.targetId===slot.id));
  store.assignShelfItem(slot.id,"bread");
  assert(employeeOpportunities(store.state).some(j=>j.task==="restocking"&&j.targetId===slot.id));
  store.assignShelfItem(slot.id,null);
  assert(!employeeOpportunities(store.state).some(j=>j.targetId===slot.id));
});

function cashierFixture():GameState{
  const original=createStockedShopState(7351);
  const hero=original.adventurers[0];
  const initial={...original,cellarDoorOpen:true,adventurers:original.adventurers.map(h=>
    h.id===hero.id?{...h,status:"at-shop" as const,floor:"shop" as const,
      gold:100,health:Math.max(1,h.health-20),
      inventory:{...h.inventory,bread:0,healing:0},equipment:{weapon:null,armor:null}}:h)};
  const line=forecastShoppingIntents(initial).get(hero.id)!.items[0];
  assert(line);
  const picked=pickUpShopItem(initial,hero.id,line.slotId).state;
  assert.notStrictEqual(picked,initial);
  const point=frontCheckoutPoint(initial.shopLayout,initial.shopRoom);
  assert(point);
  const actor:ShopTrafficActor={
    heroId:hero.id,...point,yaw:0,slot:0,gateSide:"portal",phase:"queueing",
    shoppingPhase:"awaiting-checkout",shoppingReason:"interested",
    shoppingTargetSlot:null,checkoutQueueIndex:0,route:[],waypoint:0,
    toQueue:false,intentKey:"cashier-fixture",targetIndex:0,wait:0,elapsed:0,
    blockedSeconds:0,routeProgress:null,trafficReroutes:0,idleYieldCooldown:0,
    requestActive:false,roamLeg:0,restockSeconds:null,wishItem:null,
    walkSpeed:1.15,animationTime:0,performanceTime:0,browseSide:-1,
  };
  const store=new GameStore({...picked,shopTraffic:{...picked.shopTraffic,
    initialized:true,actors:[actor],claims:[{heroId:hero.id,role:"checkout",point}]}});
  store.setEmployeePriority("tettel","cashier",1);
  return store.state;
}
test("employee cashier reaches the actual staff dock, settles one front cart and never earns a tip",()=>{
  const initial=cashierFixture();
  const cart=initial.shopCarts[0];
  const heroId=cart.heroId,total=cartTotal(cart);
  const dock=counterDockPoint(initial.shopLayout,"staff");
  assert(employeeCashierOpportunity(initial));
  assert.equal(employeeCashierOpportunity({...initial,shopTraffic:{...initial.shopTraffic,claims:[]}}),null);
  const remote={...initial,shopTraffic:{...initial.shopTraffic,
    actors:initial.shopTraffic.actors.map(a=>({...a,x:a.x+1}))}};
  assert.equal(employeeCashierOpportunity(remote),null);
  let state=initial,sawRamp=false,arrivalTick:number|null=null;
  for(let i=0;i<1800&&state.shopCarts.length;i++){
    const prior=state.employees[0];
    state=step(state);
    const worker=state.employees[0];
    assert(Math.hypot(worker.x-prior.x,worker.z-prior.z)<=EMPLOYEE_WORK_SPEED*.05+1e-8);
    assert(employeeSegmentClear(state,prior,worker));
    sawRamp||=worker.z>-20.1&&worker.z<-12.1;
    if(worker.cashierReadySince!==null&&arrivalTick===null){
      arrivalTick=worker.cashierReadySince;
      assert(Math.hypot(worker.x-dock.x,worker.z-dock.z)<.08);
      assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
      assert.deepEqual(step(parseSave(JSON.stringify(createSave(state)))),step(state));
    }
    if(state.shopCarts.length)assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance);
  }
  assert(sawRamp);assert(arrivalTick!==null);
  assert(state.worldClock.tick-arrivalTick>=EMPLOYEE_CHECKOUT_TICKS);
  assert.equal(state.shopCarts.length,0);
  assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance+total);
  assert.equal(state.adventurers.find(h=>h.id===heroId)!.gold,
    initial.adventurers.find(h=>h.id===heroId)!.gold-total);
  assert.deepEqual(state.shopEconomy.slots,initial.shopEconomy.slots);
  assert.deepEqual(state.shopEconomy.bag,initial.shopEconomy.bag);
  const receipts=state.events.filter(e=>e.type==="sale");
  assert.equal(receipts.length,cart.lines.length);
  assert(receipts.every(e=>e.saleChannel==="manual"&&e.message.includes("Served by Tettel.")));
  assert(manuallyPaidVisitors(state.events,state.day).has(heroId));
  assert(!state.events.some(e=>e.type==="tip"));
  assert.strictEqual(payReservedShopCart(state,heroId,true).state,state);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
});
test("manual takeover and a customer leaving reset employee checkout; no remote or duplicate payment",()=>{
  const initial=cashierFixture();
  const dock=counterDockPoint(initial.shopLayout,"staff");
  let state={...initial,employees:initial.employees.map(e=>({...e,...dock}))};
  for(let i=0;i<EMPLOYEE_CHECKOUT_TICKS-1;i++)state=step(state);
  assert(state.employees[0].cashierReadySince!==null);
  assert.equal(state.shopCarts.length,1);
  const paused=step(state,true);
  assert.equal(paused.employees[0].cashierReadySince,null);
  assert.equal(paused.shopEconomy.balance,initial.shopEconomy.balance);
  let manual=paused;
  for(let i=0;i<EMPLOYEE_CHECKOUT_TICKS+2;i++)manual=step(manual,true);
  assert.equal(manual.shopCarts.length,1);
  const paid=payReservedShopCart(manual,manual.shopCarts[0].heroId,true).state;
  assert.equal(paid.shopCarts.length,0);
  let after=paid;
  for(let i=0;i<EMPLOYEE_CHECKOUT_TICKS+5;i++)after=step(after);
  assert.equal(after.shopEconomy.balance,paid.shopEconomy.balance);
  assert.deepEqual(after.events,paid.events);
  const left=step({...state,shopTraffic:{...state.shopTraffic,claims:[]}});
  assert.equal(left.employees[0].cashierReadySince,null);
  assert.equal(left.shopEconomy.balance,initial.shopEconomy.balance);
});

function charityFixture(){
  const initial=createStockedShopState(7351);
  const hero=initial.adventurers.find(h=>h.status==="at-shop")!;
  const store=new GameStore({...initial,cellarDoorOpen:true,adventurers:initial.adventurers.map(h=>
    h.id===hero.id?{...h,gold:0,inventory:{...h.inventory,bread:0,healing:0}}:h)});
  assert(store.startShopRequest(hero.id,"bread","cannot-afford")!==null);
  const base=store.state;
  const actorTemplate=cashierFixture().shopTraffic.actors[0];
  const options=restockWaitingPositions(base.shopLayout,base.shopRoom);
  for(const point of options){
    const actor:ShopTrafficActor={...actorTemplate,...point,heroId:hero.id,phase:"queueing",
      shoppingPhase:"waiting-for-credit",shoppingReason:"cannot-afford",checkoutQueueIndex:-1,
      requestActive:true,wishItem:"bread",restockSeconds:60};
    const state:GameState={...base,shopTraffic:{...base.shopTraffic,initialized:true,
      actors:[actor],claims:[{heroId:hero.id,role:"credit",point}]}};
    const job=employeeCharityOpportunity(state,hero.id);
    if(job&&employeeRoute(state,EMPLOYEE_HOME,job.point))return {state,heroId:hero.id,job,point};
  }
  throw Error("No reachable physical credit fixture");
}
test("charity is opt-in and uses a reachable adjacent dock, one actual item and the existing debt ledger",()=>{
  const {state:initial,heroId,job,point}=charityFixture();
  assert(Math.hypot(job.point.x-point.x,job.point.z-point.z)>=.65);
  assert.equal(employeeCharityOpportunity(initial,heroId,heroId),null);
  assert.equal(employeeCharityOpportunity({...initial,shopRequests:[]},heroId),null);
  assert.equal(employeeCharityOpportunity({...initial,shopTraffic:{...initial.shopTraffic,claims:[]}},heroId),null);
  const moving={...initial,shopTraffic:{...initial.shopTraffic,actors:initial.shopTraffic.actors.map(a=>
    ({...a,phase:"browsing" as const,shoppingPhase:"walking-to-request-roam"}))}};
  assert.equal(employeeCharityOpportunity(moving,heroId),null);
  const empty={...initial,shopEconomy:{...initial.shopEconomy,bag:{...initial.shopEconomy.bag,bread:0},
    slots:initial.shopEconomy.slots.map(s=>s.itemId==="bread"?{...s,quantity:0}:s)}};
  assert.equal(employeeCharityOpportunity(empty,heroId),null);
  const disabled=step(initial);
  assert.equal(disabled.shopDebts.length,0);
  const store=new GameStore(initial);
  store.setEmployeePriority("tettel","charity",1);
  let state=store.state,prior=state.employees[0],sawRamp=false;
  for(let i=0;i<1100&&!state.shopDebts.length;i++){
    state=step(state);
    const worker=state.employees[0];
    assert(Math.hypot(worker.x-prior.x,worker.z-prior.z)<=EMPLOYEE_WORK_SPEED*.05+1e-8);
    assert(employeeSegmentClear(state,prior,worker));
    sawRamp||=worker.z>-20.1&&worker.z<-12.1;
    prior=worker;
  }
  assert(sawRamp);
  assert(Math.hypot(prior.x-job.point.x,prior.z-job.point.z)<.08);
  assert.equal(state.shopDebts.find(d=>d.heroId===heroId)?.outstandingGold,4);
  assert.equal(state.shopRequests.length,0);
  assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.equal(state.shopEconomy.slots.find(s=>s.itemId==="bread")?.quantity,2);
  assert.equal(state.adventurers.find(h=>h.id===heroId)?.inventory.bread,1);
  const credits=state.events.filter(e=>e.type==="shop-credit");
  assert.equal(credits.length,1);assert(credits[0].message.includes("Served by Tettel."));
  assert(!state.events.some(e=>e.type==="sale"||e.type==="tip"));
  assert.strictEqual(issueShopCredit(state,heroId).state,state);
  assert.equal(step(state).shopDebts[0].outstandingGold,4);
});
test("manual conversation, expiry and changed petitioner position prevent an employee grant",()=>{
  const {state:initial,heroId,job}=charityFixture();
  const configured=new GameStore(initial);
  configured.setEmployeePriority("tettel","charity",1);
  const ready={...configured.state,employees:configured.state.employees.map(e=>({...e,...job.point}))};
  const tick=ready.worldClock.tick+1;
  const manual=advanceEmployees({...ready,worldClock:{...ready.worldClock,tick},
    shopTraffic:{...ready.shopTraffic,tick}},false,heroId);
  assert.equal(manual.shopDebts.length,0);
  assert.equal(manual.employees[0].job,null);
  const expired={...ready,worldClock:{...ready.worldClock,tick:ready.shopRequests[0].dueTick}};
  assert.equal(advanceEmployees(expired).shopDebts.length,0);
  const moved={...ready,shopTraffic:{...ready.shopTraffic,actors:ready.shopTraffic.actors.map(a=>({...a,x:a.x+2}))}};
  assert.equal(step(moved).shopDebts.length,0);
  const credited=step(ready);
  assert.equal(credited.shopDebts.length,1);
});
