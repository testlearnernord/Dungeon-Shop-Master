import assert from "node:assert/strict";
import test from "node:test";
import {FISHING_FLICKS} from "../../src/game/fishingSkill.ts";
import {fishPullAgainst,fishPullOnWater,keepFishInsidePond}
  from "../../src/game/fishingPullPresentation.ts";

test("hooked fish always pulls exactly opposite every existing flick target",()=>{
  for(const target of FISHING_FLICKS){
    const fish=fishPullAgainst(target);
    assert.ok(Math.abs(Math.hypot(fish.x,fish.y)-1)<1e-12,target.label);
    assert.ok(fish.x*target.x+fish.y*target.y<0,target.label);
    const normalized=Math.hypot(target.x,target.y);
    assert.ok(Math.abs(fish.x+target.x/normalized)<1e-12);
    assert.ok(Math.abs(fish.y+target.y/normalized)<1e-12);
    const world=fishPullOnWater(-Math.PI/2,fish);
    assert.ok(Math.abs(Math.hypot(world.x,world.z)-1)<1e-12);
  }
});

test("screen-right fish pull follows camera yaw and pond-space perspective",()=>{
  const right=fishPullOnWater(0,{x:1,y:0});
  assert.ok(Math.abs(right.x-1)<1e-12);
  assert.ok(Math.abs(right.z)<1e-12);
  const toScreenRight=fishPullOnWater(-Math.PI/2,{x:1,y:0});
  assert.ok(Math.abs(toScreenRight.x)<1e-12);
  assert.ok(Math.abs(toScreenRight.z-1)<1e-12);
  const towardCamera=fishPullOnWater(0,{x:0,y:1});
  assert.ok(Math.abs(towardCamera.z+1)<1e-12);
  assert.deepEqual(fishPullAgainst({x:0,y:0}),{x:0,y:0});
  assert.deepEqual(fishPullOnWater(Number.NaN,{x:1,y:0}),{x:0,z:0});
});

test("the shadow never escapes the real two-by-three metre pond",()=>{
  assert.deepEqual(keepFishInsidePond(4,-4),{x:.66,z:-1.06});
  assert.deepEqual(keepFishInsidePond(-4,4),{x:-.66,z:1.06});
});
