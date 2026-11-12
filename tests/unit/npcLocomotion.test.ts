import assert from "node:assert/strict";
import test from "node:test";
import { npcLocomotion } from "../../src/game/npcLocomotion.ts";

test("NPCs animate by actual movement even in queue, staging or shop idle state",()=>{
  const origin={x:-4,z:0};
  const walking=npcLocomotion(origin,{x:-3.9664,z:0},0.016);
  assert.equal(walking.moving,true);
  assert(Math.abs(walking.speed-2.1)<0.01);
  assert.equal(walking.strideScale,1);
  const paused=npcLocomotion(origin,origin,0.016);
  assert.deepEqual(paused,{moving:false,speed:0,strideScale:0});
  const jitter=npcLocomotion(origin,{x:-4+1e-5,z:0},0.016);
  assert.equal(jitter.moving,false);
});

test("movement rate changes stride without producing NaN or runaways",()=>{
  assert.equal(npcLocomotion({x:0,z:0},{x:0.34,z:0},0.1).strideScale,1.6);
  assert.equal(npcLocomotion({x:0,z:0},{x:0.01,z:0},0.1).strideScale,0.4);
  assert.equal(npcLocomotion({x:0,z:0},{x:1,z:0},0).moving,false);
  assert.equal(npcLocomotion({x:0,z:0},{x:NaN,z:0},0.016).moving,false);
});