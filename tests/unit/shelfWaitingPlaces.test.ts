import assert from "node:assert/strict";
import test from "node:test";
import {shelfWaitingCandidates} from "../../src/game/shelfWaitingPlaces.ts";

test("shelf waiting candidates stay local, snapped and unique",()=>{
  const shelf={x:-5.25,z:0};
  const candidates=shelfWaitingCandidates(shelf);
  assert(candidates.length>8);
  const keys=new Set<string>();
  for(const point of candidates){
    assert(Number.isFinite(point.x)&&Number.isFinite(point.z));
    assert.equal(point.x*4,Math.round(point.x*4));
    assert.equal(point.z*4,Math.round(point.z*4));
    assert(Math.hypot(point.x-shelf.x,point.z-shelf.z)>=1.25);
    assert(Math.hypot(point.x-shelf.x,point.z-shelf.z)<4.5);
    keys.add(point.x+","+point.z);
  }
  assert.equal(keys.size,candidates.length);
  assert.deepEqual(shelfWaitingCandidates({x:NaN,z:0}),[]);
});
