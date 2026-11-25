import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCombatHit, applyCombatHealing, HEALING_HERB_HP, WAYBREAD_HP,
} from "../../src/game/combatVitality.ts";
import {createGroupCombat,stepGroupCombat} from "../../src/game/groupCombat.ts";
import { ITEMS } from "../../src/game/economy.ts";

test("combat damage is authoritative, armor-mitigated and cannot overkill HP",()=>{
  assert.deepEqual(applyCombatHit(40,15,4),{hp:29,amount:11});
  assert.deepEqual(applyCombatHit(2,70,0),{hp:0,amount:2});
  assert.deepEqual(applyCombatHit(40,2,40),{hp:39,amount:1},
    "a connected physical hit still has one minimum damage");
  assert.deepEqual(applyCombatHit(0,70),{hp:0,amount:0});
  assert.deepEqual(applyCombatHit(40,0),{hp:40,amount:0});
  assert.deepEqual(applyCombatHit(12,6,0,0),{hp:6,amount:6});
  for(const bad of [NaN,Infinity,-1,100001]){
    assert.throws(()=>applyCombatHit(40,bad),RangeError);
    assert.throws(()=>applyCombatHealing(20,40,bad),RangeError);
  }
});

test("item catalog and combat engine use exactly the same finite healing values",()=>{
  assert.equal(ITEMS.find(item=>item.id==="healing-herb")!.healing,HEALING_HERB_HP);
  assert.equal(ITEMS.find(item=>item.id==="bread")!.healing,WAYBREAD_HP);
  assert.deepEqual(applyCombatHealing(18,40,HEALING_HERB_HP),{hp:36,amount:18});
  assert.deepEqual(applyCombatHealing(36,40,HEALING_HERB_HP),{hp:40,amount:4});
  assert.deepEqual(applyCombatHealing(0,40,HEALING_HERB_HP),{hp:0,amount:0},
    "items cannot revive dead combatants");
  assert.throws(()=>applyCombatHealing(41,40,18),RangeError);
});

test("healing uses the same real resource budget against every opponent",()=>{
  for(const special of [false,true])for(const herbs of [0,1]){
    const state=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors:[
      {id:"hero",team:"heroes",role:"healer",style:"ranged",x:0,z:0,
        hp:15,maxHp:60,damage:10,armor:0,speed:0,reach:1.6,healCharges:herbs,magicHeals:2},
      {id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:5,
        hp:100,maxHp:100,damage:10,armor:0,speed:0,reach:1.6,
        ...(special?{specialAbility:"grapple-throw" as const}:{})},
    ]});
    const hero=state.actors.find(a=>a.id==="hero")!,enemy=state.actors.find(a=>a.id==="enemy")!;
    hero.phase="heal";hero.phaseAge=.62;hero.targetId=hero.id;enemy.cooldown=100;
    const cues=stepGroupCombat(state);
    assert.equal(hero.hp,15+(herbs?HEALING_HERB_HP:25));
    assert.equal(hero.healCharges,0);
    assert.equal(hero.magicHeals,herbs?2:1);
    assert(cues.some(cue=>cue.kind==="heal"));
  }
});
