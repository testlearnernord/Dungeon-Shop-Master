import test from "node:test";
import assert from "node:assert/strict";
import { combatPopupForCue } from "../../src/game/bossHudPresentation.ts";

test("real hero and troll hits display distinct recipients and tones",()=>{
  assert.deepEqual(combatPopupForCue({kind:"hero-hit",amount:14}),
    {target:"boss",tone:"hero",text:"-14"});
  assert.deepEqual(combatPopupForCue({kind:"hit",amount:7}),
    {target:"hero",tone:"troll",text:"-7"});
});
test("lava damage, historical lava without amount, and healing are not fabricated",()=>{
  assert.deepEqual(combatPopupForCue({kind:"lava",amount:12}),
    {target:"hero",tone:"lava",text:"-12 LAVA"});
  assert.deepEqual(combatPopupForCue({kind:"lava"}),
    {target:"hero",tone:"lava",text:"LAVA!"});
  assert.deepEqual(combatPopupForCue({kind:"heal",amount:18}),
    {target:"hero",tone:"heal",text:"+18"});
});
test("non-damaging cues never spawn fake floating numbers",()=>{
  for(const kind of ["windup","dodge","parry","miss","projectile",
    "stagger","victory","defeat"] as const){
    assert.equal(combatPopupForCue({kind}),null);
  }
  assert.equal(combatPopupForCue({kind:"hero-hit",amount:0}),null);
  assert.equal(combatPopupForCue({kind:"heal",amount:0}),null);
});
