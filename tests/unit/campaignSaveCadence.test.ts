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
