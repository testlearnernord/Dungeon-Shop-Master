import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {createStockedShopState} from "./shopFixtures.ts";
import {advanceEmployees,chooseEmployeeJob,employeeOpportunities,EMPLOYEE_DEFINITIONS,
  EMPLOYEE_WORK_SPEED,type EmployeeJob} from "../../src/game/employees.ts";
import {employeeFloorY,employeeRoute,employeeSegmentClear,employeeStoragePoint,EMPLOYEE_HOME} from "../../src/game/employeeNavigation.ts";
import {counterDockPoint} from "../../src/game/shopLayout.ts";
import {CELLAR_FLOOR_Y} from "../../src/game/cellarRoom.ts";
import {availableBagUnits,discardBag,transferShelf} from "../../src/game/economy.ts";

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
const step=(s:GameState):GameState=>{
  const tick=s.worldClock.tick+1;
  return advanceEmployees({...s,worldClock:{...s.worldClock,tick},
    shopTraffic:{...s.shopTraffic,tick}});
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
