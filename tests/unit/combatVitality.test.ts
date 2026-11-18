import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCombatHit, applyCombatHealing, HEALING_HERB_HP, WAYBREAD_HP,
} from "../../src/game/combatVitality.ts";
import { ITEMS } from "../../src/game/economy.ts";
import {
  createCombatPreview, stepCombatPreview,
} from "../../src/game/arenaCombatMotion.ts";

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

const preview=(healingSupplies:number)=>createCombatPreview({
  role:"healer",sword:false,armor:false,
  health:15,maxHealth:60,healingSupplies,
  agility:9,intellect:10,tacticsSeed:12,
});

test("troll combat spends real Healing Herbs for 18 HP; healer magic is separate",()=>{
  const herb=preview(1);
  herb.heroPhase="heal";
  herb.heroAge=0.72;
  herb.bossPhase="recover";
  herb.bossCooldown=100;
  const cues=stepCombatPreview(herb,1/60);
  assert.equal(herb.heroHp,15+HEALING_HERB_HP);
  assert.equal(herb.healingSupplies,0);
  assert.equal(herb.magicHeals,2,
    "consuming a purchased herb must not debit the healer's magic supply");
  assert(cues.some(cue=>cue.kind==="heal"&&cue.amount===HEALING_HERB_HP));

  const magic=preview(0);
  magic.heroPhase="heal";
  magic.heroAge=0.72;
  magic.bossPhase="recover";
  magic.bossCooldown=100;
  stepCombatPreview(magic,1/60);
  assert.equal(magic.heroHp,40,"innate healer magic retains its existing 25 HP tuning");
  assert.equal(magic.magicHeals,1);
  assert.equal(magic.healingSupplies,0);
});
