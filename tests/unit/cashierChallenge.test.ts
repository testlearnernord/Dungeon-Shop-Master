import assert from "node:assert/strict";
import test from "node:test";
import {CASHIER_STAGES,CASHIER_TIMING_TOLERANCE,evaluateCashierTiming}
  from "../../src/game/cashierChallenge.ts";

test("checkout checks goods and seals receipt in order, never pays after one hit",()=>{
  assert.equal(CASHIER_STAGES.length,2);
  assert.notEqual(CASHIER_STAGES[0].target,CASHIER_STAGES[1].target);
  const goods=evaluateCashierTiming(0,CASHIER_STAGES[0].target);
  assert.deepEqual(goods,{accepted:true,nextStep:1,completed:false,direction:"exact"});
  const seal=evaluateCashierTiming(goods.nextStep,CASHIER_STAGES[1].target);
  assert.deepEqual(seal,{accepted:true,nextStep:2,completed:true,direction:"exact"});
});

test("misses leave the current checkout step unchanged",()=>{
  assert.deepEqual(evaluateCashierTiming(0,0),{
    accepted:false,nextStep:0,completed:false,direction:"early"});
  assert.deepEqual(evaluateCashierTiming(1,1),{
    accepted:false,nextStep:1,completed:false,direction:"late"});
  assert.deepEqual(evaluateCashierTiming(1,NaN),{
    accepted:false,nextStep:1,completed:false,direction:"early"});
});

test("success window remains bounded and stage selection is validated",()=>{
  for(let step=0;step<CASHIER_STAGES.length;step++){
    const target=CASHIER_STAGES[step].target;
    assert(evaluateCashierTiming(step,target+CASHIER_TIMING_TOLERANCE/2).accepted);
    assert(evaluateCashierTiming(step,target-CASHIER_TIMING_TOLERANCE/2).accepted);
    assert(!evaluateCashierTiming(step,target+CASHIER_TIMING_TOLERANCE+0.01).accepted);
  }
  assert.throws(()=>evaluateCashierTiming(-1,.5),RangeError);
  assert.throws(()=>evaluateCashierTiming(2,.5),RangeError);
});
