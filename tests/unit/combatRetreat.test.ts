import assert from "node:assert/strict";
import test from "node:test";
import {createGroupCombat,stepGroupCombat,type CombatantSpec} from "../../src/game/groupCombat.ts";
import {shouldRetreat,validRetreatExit,atRetreatExit} from "../../src/game/combatRetreat.ts";

function fixture(signature=false,herbs=0,health=22,enemyHealth=100){
  const common={maxHp:100,damage:10,armor:0,reach:1.6};
  const actors:CombatantSpec[]=[
    {...common,id:"hero",team:"heroes",role:"DPS",style:"melee",
      x:0,z:0,hp:health,speed:3,healCharges:herbs},
    {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",
      x:0,z:3,hp:enemyHealth,speed:0,
      ...(signature?{specialAbility:"grapple-throw" as const}:{})},
  ];
  return createGroupCombat({actors,bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    ...(signature?{environment:"cave-lava" as const}:{}),tacticsSeed:13});
}
test("same physical retreat policy works against ordinary and signature attacks",()=>{
  for(const signature of [false,true]){
    const s=fixture(signature);
    const hero=s.actors.find(a=>a.id==="hero")!;
    const enemy=s.actors.find(a=>a.id==="enemy")!;
    enemy.cooldown=100;
    assert(shouldRetreat(s));
    stepGroupCombat(s);
    assert.equal(s.outcome,"fighting");
    assert(s.retreat&&validRetreatExit(s.retreat,s.bounds,s.environment));
    assert(hero.distanceTraveled>0);
    assert(s.events.some(e=>e.kind==="retreat-start"));
    const restored=JSON.parse(JSON.stringify(s));
    for(let i=0;i<600&&s.outcome==="fighting";i++){
      stepGroupCombat(s);
      stepGroupCombat(restored);
    }
    assert.deepEqual(s,restored);
    assert.equal(s.outcome,"retreat");
    assert(atRetreatExit(hero,s.retreat!));
    assert(hero.hp>0&&enemy.hp>0);
    assert(hero.distanceTraveled>5);
    assert.equal(s.events.filter(e=>e.kind==="retreat-start").length,1);
    assert(s.events.some(e=>e.kind==="retreat"&&e.actorId===hero.id));
  }
});
test("do not retreat while medicine remains, health is adequate or victory is close",()=>{
  assert(!shouldRetreat(fixture(false,1)));
  assert(!shouldRetreat(fixture(false,0,70)));
  assert(!shouldRetreat(fixture(false,0,22,10)));
});
test("retreating heroes remain valid damage targets and may die",()=>{
  const s=fixture(false,0,2);
  const hero=s.actors.find(a=>a.id==="hero")!,enemy=s.actors.find(a=>a.id==="enemy")!;
  hero.phase="hurt";
  enemy.z=1.5;enemy.phase="strike";enemy.phaseAge=.16;
  enemy.targetId=hero.id;enemy.lockedHeading=Math.PI;
  stepGroupCombat(s);
  assert.equal(hero.hp,0);
  assert.equal(s.outcome,"monsters");
  assert(!s.events.some(e=>e.kind==="retreat"));
});
