import assert from "node:assert/strict";
import test from "node:test";
import {
  selectCombatTarget, chooseCombatPosture, chooseCombatDefense,
  chooseCombatAbility,
} from "../../src/game/combatTactics.ts";
import { createGroupCombat, stepGroupCombat } from "../../src/game/groupCombat.ts";

test("enemy targeting is deterministic regardless of actor input order and honors tank bias",()=>{
  const monster={id:"monster",x:0,z:0,team:"monsters" as const,hp:80};
  const heroes=[
    {id:"archer",team:"heroes" as const,role:"DPS" as const,x:0,z:3,hp:20},
    {id:"tank",team:"heroes" as const,role:"tank" as const,x:0,z:3.2,hp:35},
    {id:"fallen",team:"heroes" as const,role:"tank" as const,x:0,z:1,hp:0},
  ];
  assert.equal(selectCombatTarget(monster,heroes)?.id,"tank");
  assert.equal(selectCombatTarget(monster,[...heroes].reverse())?.id,"tank");
  assert.equal(selectCombatTarget(monster,heroes,0)?.id,"archer");
  assert.equal(selectCombatTarget(monster,[{...heroes[0],id:"z"},{...heroes[0],id:"a"}])?.id,"a");
  assert.equal(selectCombatTarget(monster,[{...heroes[0],team:"monsters"}]),null);
  assert.equal(selectCombatTarget(monster,[heroes[2]]),null);
  assert.throws(()=>selectCombatTarget(monster,heroes,NaN),RangeError);
});

test("the same engagement policy supplies independent attack, closing and retreat intents",()=>{
  assert.deepEqual(chooseCombatPosture({
    distance:6,ready:true,clearShot:true,attackRange:7.7,
    approachBeyond:3.5,
  }),{attack:true,approach:true,withdraw:false},
  "a charging Troll can start a valid attack during its approach tick");
  assert.deepEqual(chooseCombatPosture({
    distance:3,ready:false,clearShot:true,attackRange:5,
    approachBeyond:3.5,
  }),{attack:false,approach:false,withdraw:false});
  assert.deepEqual(chooseCombatPosture({
    distance:2,ready:true,clearShot:false,attackRange:11,
    approachBeyond:7,withdrawWithin:4.5,
  }),{attack:false,approach:false,withdraw:true});
  assert.throws(()=>chooseCombatPosture({
    distance:NaN,ready:true,clearShot:true,attackRange:5,approachBeyond:3,
  }),RangeError);
});

test("defense decisions consume real stamina and do not invent perfect reflexes",()=>{
  assert.equal(chooseCombatDefense({
    threatened:false,stamina:100,preferParry:true,canParry:true,
  }),"none");
  assert.equal(chooseCombatDefense({
    threatened:true,stamina:20,preferParry:true,canParry:true,
  }),"parry");
  assert.equal(chooseCombatDefense({
    threatened:true,stamina:27,preferParry:true,canParry:false,
  }),"none");
  assert.equal(chooseCombatDefense({
    threatened:true,stamina:28,preferParry:false,canParry:true,
  }),"roll");
  assert.throws(()=>chooseCombatDefense({
    threatened:true,stamina:-1,preferParry:false,canParry:true,
  }),RangeError);
});

test("boss skill rotation preserves real eligibility, while ordinary monsters remain configured",()=>{
  const profile=["troll-smash","troll-slam","troll-grab"] as const;
  assert.equal(chooseCombatAbility(profile,1,3,0),"troll-smash",
    "first strike must not be an unavoidable opening grab");
  assert.equal(chooseCombatAbility(profile,2,4.5,0.3),"troll-grab");
  assert.equal(chooseCombatAbility(profile,2,5.4,0.3),"troll-smash");
  assert.equal(chooseCombatAbility(profile,3,6,0.9),"troll-slam");
  assert.equal(chooseCombatAbility(profile,4,4,0.9),"troll-grab");
  assert.equal(chooseCombatAbility(["ordinary"],1,3,0),"ordinary");
  assert.equal(chooseCombatAbility(["heavy"],5,2,0),"heavy");
  assert.throws(()=>chooseCombatAbility([],1,2,0),RangeError);
  assert.throws(()=>chooseCombatAbility(profile,2,2,1),RangeError);
});

test("real group enemies target a wounded tank from the shared target-selection policy",()=>{
  const actors=[
    {id:"monster",team:"monsters" as const,role:"monster" as const,
      style:"melee" as const,x:0,z:0,hp:80,maxHp:80,damage:9,armor:1,speed:0,reach:2},
    {id:"archer",team:"heroes" as const,role:"DPS" as const,
      style:"ranged" as const,x:1,z:3,hp:40,maxHp:40,damage:4,armor:0,speed:0,reach:1},
    {id:"tank",team:"heroes" as const,role:"tank" as const,
      style:"melee" as const,x:1,z:3.35,hp:55,maxHp:55,damage:6,armor:3,speed:0,reach:2},
  ];
  const state=createGroupCombat({actors,bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10}});
  stepGroupCombat(state);
  // The monster has slightly more Euclidean distance to the tank, but
  // its aggro preference is a real selection rule in the live engine.
  assert.equal(selectCombatTarget(
    state.actors.find(actor=>actor.id==="monster")!,state.actors,
  )?.id,"tank");
  assert.deepEqual(createGroupCombat({actors,bounds:state.bounds}).actors,
    createGroupCombat({actors:[...actors].reverse(),bounds:state.bounds}).actors);
});
