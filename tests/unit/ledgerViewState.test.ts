import assert from "node:assert/strict";
import test from "node:test";
import {restoreLedgerView} from "../../src/ledgerViewState.ts";

test("unfinished ledgers return to the exact saved chapter and animation preference",()=>{
  for(let chapter=0;chapter<4;chapter++){
    assert.deepEqual(restoreLedgerView(chapter,true,4),
      {page:chapter,animationSkipped:true});
    assert.deepEqual(restoreLedgerView(chapter,false,4),
      {page:chapter,animationSkipped:false});
  }
});
test("old or malformed session markers fall back to the first readable page",()=>{
  for(const bad of [-1,4,100,1.5,NaN,Infinity,"3",null,{},undefined]){
    assert.deepEqual(restoreLedgerView(bad,"true",4),
      {page:0,animationSkipped:false});
  }
  assert.deepEqual(restoreLedgerView(undefined,undefined,4),
    {page:0,animationSkipped:false});
  assert.deepEqual(restoreLedgerView(3,true,4),
    {page:3,animationSkipped:true});
  assert.throws(()=>restoreLedgerView(0,false,0),RangeError);
});
