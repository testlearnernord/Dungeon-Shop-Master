import assert from "node:assert/strict";
import test from "node:test";
import { BED_HOLD_MS, sleepHoldProgress } from "../../src/bedtime.ts";
import { summarizeLedger } from "../../src/merchantLedger.ts";
import { createGameState, advanceDay } from "../../src/game/gameState.ts";

test("rest can only complete after an uninterrupted hold in reach",()=>{
  const start=100;
  assert.equal(sleepHoldProgress(start,start+100,true,true),100/BED_HOLD_MS);
  assert.equal(sleepHoldProgress(start,start+1499,true,true)<1,true);
  assert.equal(sleepHoldProgress(start,start+1500,true,true),1);
  assert.equal(sleepHoldProgress(start,start+5000,false,true),0);
  assert.equal(sleepHoldProgress(start,start+5000,true,false),0);
  assert.equal(sleepHoldProgress(start,Infinity,true,true),0);
  assert.equal(sleepHoldProgress(start,start-500,true,true),0);
});

test("ledger exactly reconciles one authoritative day without mutating the save",()=>{
  const before=createGameState(7351);
  const after=advanceDay(before).state;
  const snapshot=JSON.stringify(after);
  const summary=summarizeLedger(before,after);
  assert.equal(summary.closingDay,1);
  assert.equal(summary.morningDay,2);
  assert.equal(summary.beforeGold,before.shopEconomy.balance);
  assert.equal(summary.afterGold,after.shopEconomy.balance);
  assert.equal(summary.overnightChange,after.shopEconomy.balance-before.shopEconomy.balance);
  assert.equal(summary.soldUnits,summary.receipts.reduce((n,r)=>n+r.quantity,0));
  assert.equal(summary.bookedRevenue,summary.receipts.reduce((n,r)=>n+r.revenue,0));
  assert.equal(summary.relevantEvents.length,after.events.length-before.events.length);
  assert(summary.safeChronicle.every(e=>!["level6-combat","level7-exploration","dungeon-outcome"]
    .includes(e.type)));
  assert.equal(JSON.stringify(after),snapshot,"Rendering the book cannot alter GameState");
  assert.throws(()=>summarizeLedger(before,before),RangeError);
});

test("same-world simulation and ledger report are deterministic",()=>{
  const start=createGameState(7351),first=advanceDay(start).state;
  const same=advanceDay(createGameState(7351)).state;
  assert.deepEqual(summarizeLedger(start,first),summarizeLedger(start,same));
});
