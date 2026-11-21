import assert from "node:assert/strict";
import test from "node:test";
import {
  developerPresentationTime,LAB_CAPTURE_STRIDE,LAB_PRESENTATION_LAG,
} from "../../src/game/developerCombatPresentation.ts";
import {sampleGroupReplayPresentation} from "../../src/game/groupReplayPresentation.ts";
import {
  createGroupCombat,stepGroupCombat,captureGroupCombatFrame,
} from "../../src/game/groupCombat.ts";
import {
  buildDeveloperCombat,DEFAULT_DEVELOPER_CONFIG,
} from "../../src/game/developerCombatScenario.ts";

test("lab keeps a 60Hz authoritative motor with compact 10Hz checkpoints",()=>{
  const state=createGroupCombat(buildDeveloperCombat(DEFAULT_DEVELOPER_CONFIG));
  const frames=[captureGroupCombatFrame(state)];
  for(let tick=1;tick<=24;tick++){
    stepGroupCombat(state,1/60);
    if(tick%LAB_CAPTURE_STRIDE===0)
      frames.push(captureGroupCombatFrame(state));
  }
  assert.equal(LAB_CAPTURE_STRIDE,6);
  assert.equal(LAB_PRESENTATION_LAG,.1);
  assert.equal(frames.length,5,"No 60Hz replay-memory explosion");
  assert(Math.abs(state.time-.4)<1e-10);
  assert(Math.abs(frames.at(-1)!.t-state.time)<1e-10);
  assert.equal(frames.every((f,i)=>i===0||
    Math.abs(f.t-frames[i-1].t-.1)<1e-8),true);
});

test("every display refresh interpolates between two ACTUAL committed poses",()=>{
  const state=createGroupCombat(buildDeveloperCombat(DEFAULT_DEVELOPER_CONFIG));
  const frames=[captureGroupCombatFrame(state)];
  for(let i=0;i<12;i++){
    stepGroupCombat(state,1/60);
    if((i+1)%6===0)frames.push(captureGroupCombatFrame(state));
  }
  const a=frames[1],b=frames[2];
  const t=developerPresentationTime(.2,0,b.t,0,false);
  assert(Math.abs(t-a.t)<1e-7);
  const renderTimes=[0,1/144,2/144,3/144,4/144,5/144,6/144].map(x=>
    developerPresentationTime(.2,x,b.t,t,false));
  // Every 144Hz render can display a new interpolated position, even
  // though only two compact 10Hz checkpoints were stored.
  assert.equal(new Set(renderTimes.map(n=>n.toFixed(8))).size,7);
  const actor=a.actors.find(c=>c.id==="lab-hero-1")!;
  const next=b.actors.find(c=>c.id===actor.id)!;
  const sample=sampleGroupReplayPresentation(frames,renderTimes[3]);
  const middle=sample.actors.find(c=>c.id===actor.id)!;
  const factor=(renderTimes[3]-a.t)/(b.t-a.t);
  assert(Math.abs(middle.x-(actor.x+(next.x-actor.x)*factor))<1e-7);
  assert(Math.abs(middle.z-(actor.z+(next.z-actor.z)*factor))<1e-7);
  assert.equal(middle.hp,actor.hp,
    "Interpolating must never forecast HP, hit results or stamina");
  assert.equal(middle.phase,actor.phase);
});

test("pause and finish show the exact latest committed result, resume never rewinds",()=>{
  let t=developerPresentationTime(.3,0,.3,0,false);
  assert(Math.abs(t-.2)<1e-10);
  t=developerPresentationTime(.3,0,.3,t,true);
  assert.equal(t,.3);
  assert.equal(developerPresentationTime(.31,0,.31,t,false),.3,
    "Resuming does not snap backwards after pause");
  assert.equal(developerPresentationTime(.4,0,.4,t,false),.30000000000000004);
  assert.equal(developerPresentationTime(.4,0,.4,t,true),.4);
  assert.throws(()=>developerPresentationTime(NaN,0,0,0,false),RangeError);
  assert.throws(()=>developerPresentationTime(0,-1,0,0,false),RangeError);
});
