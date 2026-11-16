import assert from "node:assert/strict";
import test from "node:test";
import {npcLocomotion,easedNpcWalkSpeed,turnNpcToward} from "../../src/game/npcLocomotion.ts";

test("NPCs animate by actual movement even in queue, staging or shop idle state",()=>{
  const origin={x:-4,z:0};
  const walking=npcLocomotion(origin,{x:-3.9664,z:0},0.016);
  assert.equal(walking.moving,true);
  assert(Math.abs(walking.speed-2.1)<0.01);
  assert(Math.abs(walking.strideScale-1)<1e-10);
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
test("pedestrians accelerate steadily and decelerate only on the final approach",()=>{
  const delta=.05;
  let speed=0;
  const samples:number[]=[];
  for(let i=0;i<12;i++){
    speed=easedNpcWalkSpeed(speed,10-i*.09,delta,false);
    samples.push(speed);
    assert(speed<=2.1+1e-9);
  }
  assert(samples[0]>0&&samples[0]<.4,"starts below full walking speed");
  assert(samples.every((value,i)=>i===0||value>=samples[i-1]),
    "acceleration is monotonic on unobstructed routes");
  assert(Math.abs(speed-2.1)<.001,"reaches normal speed");
  const cruising=easedNpcWalkSpeed(speed,.3,delta,false);
  const arriving=easedNpcWalkSpeed(speed,.3,delta,true);
  assert.equal(cruising,2.1,"intermediate path corners do not force braking");
  assert(arriving<cruising,"last station approach eases down");
  assert(easedNpcWalkSpeed(arriving,.16,delta,true)>=.42,
    "never asymptotically stalls short of the reserved station");
  assert.equal(easedNpcWalkSpeed(0,3,0,false),0);
  assert.equal(easedNpcWalkSpeed(Infinity,3,.016,false),0);
});

test("pedestrian heading turns gradually through the shortest +/-PI arc",()=>{
  const turn=turnNpcToward(0,Math.PI,.016);
  assert(turn>0&&turn<=8*.016+1e-9);
  const across=turnNpcToward(Math.PI-.05,-Math.PI+.05,.05);
  const separation=Math.atan2(Math.sin(-Math.PI+.05-across),
    Math.cos(-Math.PI+.05-across));
  assert(Math.abs(separation)<.001,"wrapped near-PI heading uses short arc");
  const quarter=turnNpcToward(0,Math.PI/2,.1);
  assert(quarter>0&&quarter<Math.PI/2);
  assert.equal(turnNpcToward(1,2,0),1);
  assert.equal(turnNpcToward(NaN,1,.016),0);
});
