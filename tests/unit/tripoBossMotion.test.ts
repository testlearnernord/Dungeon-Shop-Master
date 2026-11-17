import assert from "node:assert/strict";
import test from "node:test";
import { sampleTripoBossPose } from "../../src/game/tripoBossMotion.ts";

const sample = (phase: "chase"|"windup"|"strike"|"recover"|"stagger"|"dead",
  age=0, slam=false, moved=0, time=0) =>
  sampleTripoBossPose({ phase, phaseAge: age, slam, moved, time });

test("Tripo candidate maps real duel phases, not a second combat controller", () => {
  assert.equal(sample("chase").clip, "idle_combat");
  assert.equal(sample("chase",0,false,.05).clip, "walk_heavy");
  assert.equal(sample("windup",.4).clip, "attack_2h_swing");
  assert.equal(sample("strike",.14).clip,"attack_2h_swing");
  assert.equal(sample("windup",.4,true).clip, "attack_2h_swing");
  assert.equal(sample("stagger",.8).clip, "stagger");
  assert.equal(sample("dead",5,false,0,0).clip, "death_fall");
  assert.equal(sampleTripoBossPose({phase:"chase",phaseAge:0,slam:false,moved:0,time:10,introTime:10}).clip,"roar");
});
test("one attack animation spans windup, strike and recover without resetting", () => {
  for(const slam of [false,true]){
    const windupEnd=sample("windup",slam?1.05:.85,slam);
    const strikeStart=sample("strike",0,slam);
    const contact=sample("strike",.14,slam);
    const strikeEnd=sample("strike",.38,slam);
    const recoverStart=sample("recover",0,slam);
    assert.equal(windupEnd.clip,strikeStart.clip);
    assert.equal(strikeStart.clip,recoverStart.clip);
    assert(Math.abs(windupEnd.progress-strikeStart.progress)<1e-10);
    assert(Math.abs(strikeEnd.progress-recoverStart.progress)<1e-10);
    assert(contact.progress>strikeStart.progress);
    assert(contact.progress<strikeEnd.progress);
  }
});
test("overhead strike reaches the measured impact pose at the real 140ms tick",()=>{
  for(const slam of [false,true]){
    const before=sample("windup",slam?1.05:.85,slam);
    const start=sample("strike",0,slam);
    const hit=sample("strike",.14,slam);
    const end=sample("strike",.38,slam);
    assert(Math.abs(start.progress-before.progress)<1e-10);
    assert(Math.abs(hit.progress*5-1.934)<.02);
    assert(hit.progress>before.progress && hit.progress<end.progress);
    assert(Math.abs(sample("recover",0,slam).progress-end.progress)<1e-10);
  }
});

test("looping walk is bounded; death holds its ending pose", () => {
  assert.equal(sample("chase",0,false,.1,2.375).progress,0);
  const sustained=sampleTripoBossPose({phase:"chase",phaseAge:0,slam:false,moved:0,time:2.375},0,{walking:true,distance:3.6});
  assert.equal(sustained.clip,"walk_heavy");
  assert(Math.abs(sustained.progress-.5)<1e-10);
  const stopped=sampleTripoBossPose({phase:"chase",phaseAge:0,slam:false,moved:.05,time:2.375},0,{walking:false,distance:3.6});
  assert.equal(stopped.clip,"idle_combat");
  assert.equal(sampleTripoBossPose({phase:"dead",phaseAge:100,slam:false,time:100,moved:0},4).progress,1);
  for(const phase of ["chase","windup","strike","recover","stagger","dead"] as const)
    for(const age of [0,.14,1,2,100,Infinity,-1]){
      const output=sample(phase,age,true,.1,age);
      assert(Number.isFinite(output.progress));
      assert(output.progress>=0 && output.progress<=1);
    }
});
