import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {shouldQueueCampaignSave} from "../../src/game/campaignSaveCadence.ts";
import {WORLD_TICKS_PER_GAME_MINUTE,scheduleWorldEvent} from "../../src/game/worldClock.ts";

test("20 world-motion ticks cost at most one autosave, but user actions persist immediately",()=>{
  let previous=createGameState(99);
  let queuedTick=previous.worldClock.tick;
  let saved=0;
  for(let tick=1;tick<=100;tick++){
    const current={...previous,worldClock:{...previous.worldClock,tick}};
    if(shouldQueueCampaignSave(previous,current,queuedTick)){
      saved++;queuedTick=current.worldClock.tick;
    }
    previous=current;
  }
  assert.equal(saved,5);
  const bought={...previous,shopEconomy:{...previous.shopEconomy,
    balance:previous.shopEconomy.balance-1}};
  assert.equal(shouldQueueCampaignSave(previous,bought,queuedTick),true);
  assert.equal(shouldQueueCampaignSave(previous,previous,queuedTick),false);
  assert.equal(WORLD_TICKS_PER_GAME_MINUTE,20);
});

test("scheduled events and time resets bypass the clock-only save cadence",()=>{
  const start=createGameState(2026);
  const time={...start,worldClock:{...start.worldClock,tick:1}};
  assert.equal(shouldQueueCampaignSave(start,time,0),false);
  const scheduled={...time,worldClock:scheduleWorldEvent(
    time.worldClock,"report",3,"hero")};
  assert.equal(shouldQueueCampaignSave(time,scheduled,0),true);
  assert.equal(shouldQueueCampaignSave(scheduled,start,3000),true);
});

test("worker locomotion and cashier timers share the one-second save cadence; priority and cargo changes remain immediate",()=>{
  let previous=createGameState(99);
  let queuedTick=0,saved=0;
  for(let tick=1;tick<=100;tick++){
    const current={...previous,worldClock:{...previous.worldClock,tick},
      employees:previous.employees.map(e=>({...e,x:e.x+.01,lastStepTick:tick,
        cashierReadySince:tick>80?81:null}))};
    if(shouldQueueCampaignSave(previous,current,queuedTick)){
      saved++;queuedTick=tick;
    }
    previous=current;
  }
  assert.equal(saved,5);
  const configured={...previous,employees:previous.employees.map(e=>({...e,
    priorities:{...e.priorities,restocking:1 as const}}))};
  assert(shouldQueueCampaignSave(previous,configured,100));
  const reserved={...configured,employees:configured.employees.map(e=>({...e,
    restock:{slotId:"shelf-1-slot-1",itemId:"bread" as const,units:1,
      stage:"collect" as const,readySince:null}}))};
  assert(shouldQueueCampaignSave(configured,reserved,100));
  const carried={...reserved,employees:reserved.employees.map(e=>({...e,
    restock:{...e.restock!,stage:"deliver" as const}}))};
  assert(shouldQueueCampaignSave(reserved,carried,100));
  assert(shouldQueueCampaignSave(carried,configured,100));
});
