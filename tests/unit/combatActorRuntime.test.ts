import assert from "node:assert/strict";
import test from "node:test";
import { moveCombatant, combatDirection, combatHeading } from "../../src/game/combatMovement.ts";
import { tickCombatAction, tickCombatCooldown, regenerateCombatStamina } from "../../src/game/combatActionClock.ts";
import { createCombatPreview, stepCombatPreview, SAFE_HERO_RADIUS, WALKABLE_RADIUS } from "../../src/game/arenaCombatMotion.ts";
import { resolveSpatialBoss } from "../../src/game/bossCombatReplay.ts";
import { createGroupCombat, stepGroupCombat } from "../../src/game/groupCombat.ts";

test("the same collision integrator handles circular boss arenas and wall sliding",()=>{
  const point={x:0,z:1};
  const initial=structuredClone(point);
  const bounded=moveCombatant(point,{x:12,z:0},{kind:"circle",radius:5});
  assert(bounded.crossedBoundary);
  assert(Math.abs(Math.hypot(bounded.x,bounded.z)-5)<1e-8);
  assert.equal(bounded.distance,Math.hypot(bounded.x,bounded.z-1));
  assert.deepEqual(point,initial,"the authoritative movement integration is pure");
  const inside=moveCombatant(point,{x:2,z:1},{kind:"circle",radius:5});
  assert.deepEqual(inside,{x:2,z:2,distance:Math.sqrt(5),crossedBoundary:false});
  const slide=moveCombatant(point,{x:3,z:2},{kind:"walkable",
    canOccupy:p=>p.x<2});
  assert.deepEqual(slide,{x:0,z:3,distance:2,crossedBoundary:false});
  const blocked=moveCombatant(point,{x:3,z:2},{kind:"walkable",
    canOccupy:()=>false});
  assert.equal(blocked.distance,0);
  assert.deepEqual(combatDirection({x:0,z:0},{x:0,z:3}),{x:0,z:1});
  assert.equal(combatHeading({x:0,z:0},{x:0,z:3}),0);
  assert.throws(()=>moveCombatant(point,{x:NaN,z:0},{kind:"circle",radius:5}),RangeError);
  assert.throws(()=>moveCombatant(point,{x:1,z:0},{kind:"circle",radius:0}),RangeError);
});

test("one action scheduler owns contact-once, completion, cooldown and stamina for all motor types",()=>{
  const window={contactAt:0.28,completeAt:0.68};
  let age=0,applied=false,contactCount=0;
  for(let i=0;i<48;i++){
    const tick=tickCombatAction(age,1/60,applied,window);
    age=tick.age;
    if(tick.contactDue){contactCount++;applied=true;}
    assert.equal(tick.complete,age>=window.completeAt);
  }
  assert.equal(contactCount,1,"a long held attack cannot hit every 60Hz frame");
  assert.equal(tickCombatCooldown(0.01,1/60),0);
  assert.equal(regenerateCombatStamina(99.9,1/60,18),100);
  for(const bad of [NaN,-1,Infinity]){
    assert.throws(()=>tickCombatAction(bad,1/60,false),RangeError);
    assert.throws(()=>tickCombatCooldown(bad,1/60),RangeError);
  }
  assert.throws(()=>tickCombatAction(0,1/60,false,{contactAt:0.5,completeAt:0.2}),RangeError);
});

test("ordinary monsters physically travel, collide and record attacks with shared action clocks",()=>{
  const options={
    bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
    actors:[
      {id:"hero",team:"heroes" as const,role:"tank" as const,style:"melee" as const,
        x:0,z:-3,hp:60,maxHp:60,damage:8,armor:2,speed:3,reach:1.6},
      {id:"monster",team:"monsters" as const,role:"monster" as const,style:"melee" as const,
        x:0,z:3,hp:70,maxHp:70,damage:10,armor:2,speed:2.5,reach:1.6},
    ],
  };
  const a=createGroupCombat(options);
  const b=createGroupCombat(options);
  for(let i=0;i<600;i++){
    stepGroupCombat(a);
    stepGroupCombat(b);
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
  assert(a.actors.some(actor=>actor.distanceTraveled>1));
  assert(a.events.some(event=>event.kind==="hit"||event.kind==="dodge"||event.kind==="parry"));
  assert(a.actors.every(actor=>Number.isFinite(actor.x)&&Number.isFinite(actor.z)));
});

test("boss still traverses the real arena, preserves deterministic grabs and immutable recorded timelines",()=>{
  const opts={role:"tank" as const,sword:true,armor:true,
    health:120,maxHealth:120,healingSupplies:1,
    agility:12,tacticsSeed:9};
  const a=createCombatPreview(opts), b=createCombatPreview(opts);
  for(let i=0;i<1100;i++){
    const cues=stepCombatPreview(a,1/60);
    assert.deepEqual(cues,stepCombatPreview(b,1/60));
    if(a.outcome!=="fighting")break;
    assert(Math.hypot(a.boss.x,a.boss.z)<=WALKABLE_RADIUS+0.001);
    if(a.heroPhase!=="thrown")
      assert(Math.hypot(a.hero.x,a.hero.z)<=SAFE_HERO_RADIUS+0.001);
  }
  assert.deepEqual(a,b);
  assert(a.distanceTraveled>0);
  const first=resolveSpatialBoss("test-hero",2,opts);
  const second=resolveSpatialBoss("test-hero",2,opts);
  assert.deepEqual(first,second);
  assert(first.replay.frames.length>1);
  assert(first.replay.frames.every(frame=>Number.isFinite(frame.heroHp) &&
    frame.heroHp>=0 && Number.isFinite(frame.bossHp)));
});
