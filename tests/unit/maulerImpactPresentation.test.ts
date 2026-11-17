import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleMaulerImpact } from "../../src/game/maulerImpactPresentation.ts";

test("boss impact presentation remains inert during intro, chase, stagger and death", () => {
  for (const phase of ["chase","stagger","dead"] as const) {
    for (const age of [0,0.14,0.3,10]) {
      const frame=sampleMaulerImpact(phase,age,true);
      assert.equal(frame.impact,0);
      assert.equal(frame.telegraph,0);
      assert.equal(frame.flash,0);
    }
  }
});

test("telegraph increases through the locked real windup, without early impact", () => {
  for (const slam of [false,true]) {
    const end=slam?1.05:.85;
    const start=sampleMaulerImpact("windup",0,slam);
    const mid=sampleMaulerImpact("windup",end/2,slam);
    const finish=sampleMaulerImpact("windup",end,slam);
    assert.ok(start.telegraph>0 && start.telegraph<mid.telegraph);
    assert.ok(mid.telegraph<finish.telegraph);
    assert.equal(finish.impact,0);
    assert.equal(finish.flash,0);
  }
});

test("impact is triggered at the combat tick and continues across strike/recover", () => {
  for (const slam of [false,true]) {
    assert.equal(sampleMaulerImpact("strike",0.139,slam).impact,0);
    const contact=sampleMaulerImpact("strike",0.14,slam);
    assert.ok(contact.impact>0.3);
    assert.ok(contact.flash>0);
    const before=sampleMaulerImpact("strike",.38,slam);
    const after=sampleMaulerImpact("recover",0,slam);
    assert.deepEqual(after,before);
    assert.ok(after.debrisRise>0);
    const end=sampleMaulerImpact("recover",.46,slam);
    assert.equal(end.impact,0);
    assert.equal(end.flash,0);
  }
});

test("heavy slam produces larger rock eruption than ordinary hammer strike", () => {
  const heavy=sampleMaulerImpact("recover",.12,true);
  const regular=sampleMaulerImpact("recover",.12,false);
  assert.ok(heavy.impact>regular.impact);
  assert.ok(heavy.debrisSpread>regular.debrisSpread);
  assert.ok(heavy.debrisRise>regular.debrisRise);
  assert.ok(heavy.ringScale>regular.ringScale);
});

test("sampling is repeatable and never mutates combat state", () => {
  const original={phase:"strike" as const,age:.22,slam:true};
  const a=sampleMaulerImpact(original.phase,original.age,original.slam);
  const b=sampleMaulerImpact(original.phase,original.age,original.slam);
  assert.deepEqual(a,b);
  assert.deepEqual(original,{phase:"strike",age:.22,slam:true});
});
