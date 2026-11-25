import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCombatActorPhase, combatActorActivity, enterCombatActorPhase,
  refreshCombatActorResources,
} from "../../src/game/combatActor.ts";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat,
} from "../../src/game/groupCombat.ts";

const groupOptions={
  bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
  actors:[
    {id:"hero",team:"heroes" as const,role:"tank" as const,
      style:"melee" as const,x:-2,z:0,hp:50,maxHp:50,
      speed:2.6,reach:1.6,damage:9,armor:3},
    {id:"skeleton",team:"monsters" as const,role:"monster" as const,
      style:"melee" as const,x:2,z:0,hp:42,maxHp:42,
      speed:2.4,reach:1.6,damage:8,armor:1,meleeAbility:"heavy" as const},
  ],
};

test("normal group actors implement the same live combat state contract as the boss",()=>{
  const group=createGroupCombat(groupOptions);
  const hero=group.actors.find(actor=>actor.id==="hero")!;
  assert.equal(hero.hp,50);
  enterCombatActorPhase(hero,"windup");
  assert.equal(hero.phase,"windup");
  assert.equal(hero.phaseAge,0);
  assert.equal(hero.applied,false);
  const tick=advanceCombatActorPhase(hero,1/60,{completeAt:0.62});
  assert(!tick.complete);
  assert.equal(hero.phaseAge,1/60);
  refreshCombatActorResources(hero,1/60,17);
  assert(hero.stamina<=100);
  assert.equal(combatActorActivity(hero.phase),"attack");
  assert.deepEqual(createGroupCombat(groupOptions),createGroupCombat(groupOptions));
});

test("universal phase categories preserve all existing legacy v1 animation labels",()=>{
  const examples={
    move:"move",chase:"move",windup:"attack",strike:"attack",
    attack:"attack",cast:"attack",roll:"defend",parry:"defend",
    heal:"heal",recover:"recover",stagger:"recover",grabMiss:"recover",
    grab:"grab",throw:"grab",grabbed:"grab",thrown:"grab",
    hurt:"disabled",dead:"dead",
  } as const;
  for(const [phase,kind] of Object.entries(examples))
    assert.equal(combatActorActivity(phase),kind);
  assert.throws(()=>combatActorActivity("invisible-instant-kill"),RangeError);
});

test("real ordinary and boss motor remain deterministic using live actor lifecycle",()=>{
  const a=createGroupCombat(groupOptions),b=createGroupCombat(groupOptions);
  for(let i=0;i<1500;i++){
    assert.deepEqual(stepGroupCombat(a),stepGroupCombat(b));
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
  const first=resolveGroupCombat(groupOptions,25);
  const second=resolveGroupCombat(groupOptions,25);
  assert.deepEqual(first,second);
  assert(first.replay.frames.length>1);
});
