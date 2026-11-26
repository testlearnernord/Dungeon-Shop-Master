import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {createStockedShopState} from "./shopFixtures.ts";
import {advanceEmployees,chooseEmployeeJob,employeeOpportunities,EMPLOYEE_DEFINITIONS,
  EMPLOYEE_WORK_SPEED,type EmployeeJob} from "../../src/game/employees.ts";
import {employeeFloorY,employeeRoute,employeeSegmentClear,EMPLOYEE_HOME} from "../../src/game/employeeNavigation.ts";
import {counterDockPoint} from "../../src/game/shopLayout.ts";
import {CELLAR_FLOOR_Y} from "../../src/game/cellarRoom.ts";

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
test("physical employee ticks move to a genuine shelf opportunity and return without changing any goods or gold",()=>{
  const initial=createStockedShopState(7351);
  const store=new GameStore({...initial,cellarDoorOpen:true});
  store.setEmployeePriority("tettel","restocking",1);
  let state=store.state;
  const opportunity=employeeOpportunities(state).find(j=>j.task==="restocking");
  assert(opportunity);
  const tick=(s:GameState):GameState=>{
    const next=s.worldClock.tick+1;
    return advanceEmployees({...s,worldClock:{...s.worldClock,tick:next},
      shopTraffic:{...s.shopTraffic,tick:next}});
  };
  let prior=state.employees[0],sawRamp=false;
  for(let i=0;i<900&&state.employees[0].status!=="ready";i++){
    state=tick(state);
    const next=state.employees[0];
    assert(Math.hypot(next.x-prior.x,next.z-prior.z)<=EMPLOYEE_WORK_SPEED*.05+1e-8);
    assert(employeeSegmentClear(state,prior,next));
    sawRamp||=next.z>-20.1&&next.z<-12.1;
    prior=next;
    if(i===100){
      const saved=parseSave(JSON.stringify(createSave(state)));
      assert.deepEqual(tick(saved),tick(state),"reload must preserve the committed route");
    }
  }
  assert(sawRamp);
  assert.equal(state.employees[0].status,"ready");
  assert.equal(state.employees[0].job?.task,"restocking");
  assert.deepEqual(state.shopEconomy,initial.shopEconomy);
  assert.deepEqual(state.adventurers,initial.adventurers);
  assert.deepEqual(state.events,initial.events);
  const configured=new GameStore(state);
  configured.setEmployeePriority("tettel","restocking",0);
  state=configured.state;
  for(let i=0;i<900&&state.employees[0].status!=="idle";i++)state=tick(state);
  assert.equal(state.employees[0].status,"idle");
  assert.equal(state.employees[0].job,null);
  assert(Math.hypot(state.employees[0].x-EMPLOYEE_HOME.x,state.employees[0].z-EMPLOYEE_HOME.z)<.08);
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
