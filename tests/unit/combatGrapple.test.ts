import assert from "node:assert/strict";
import test from "node:test";
import {
  grappleEscapeChance,grappleEscapes,grappleHoldPosition,
  grappleLaunchVelocity,deterministicGrappleSample,
  GRAPPLE_TIMING,
} from "../../src/game/combatGrapple.ts";
import {
  createGroupCombat,resolveGroupCombat,stepGroupCombat,
  type CombatantSpec, type GroupCombatState,
} from "../../src/game/groupCombat.ts";
import {
  createCombatPreview,stepCombatPreview,GRAPPLE_TIMING as BOSS_TIMING,
} from "../../src/game/arenaCombatMotion.ts";

const bounds={minX:-12,maxX:12,minZ:-12,maxZ:12};
function specs(heroId="hero"):CombatantSpec[] {
  return [
    {id:"boss",team:"monsters",role:"monster",style:"melee",
      x:0,z:2,hp:320,maxHp:320,damage:25,armor:12,
      speed:2.7,reach:1.8,radius:1.3,agility:7,
      specialAbility:"grapple-throw",grappleDamage:42},
    {id:heroId,team:"heroes",role:"tank",style:"melee",
      x:0,z:0,hp:115,maxHp:115,damage:7,armor:3,
      speed:2.5,reach:1.7,agility:10},
    {id:"friend",team:"heroes",role:"DPS",style:"ranged",
      x:-4,z:-2,hp:90,maxHp:90,damage:5,armor:1,
      speed:3,reach:1.6,agility:13},
    {id:"healer",team:"heroes",role:"healer",style:"ranged",
      x:4,z:-2,hp:85,maxHp:85,damage:4,armor:1,
      speed:3,reach:1.7,agility:12,healCharges:1},
  ];
}
function forcedGrab(heroId="hero",withWall=false):{
  state:GroupCombatState;
  boss:GroupCombatState["actors"][number];
  hero:GroupCombatState["actors"][number];
}{
  const state=createGroupCombat({bounds,actors:specs(heroId),
    ...(withWall?{obstacles:[
      {id:"rear-wall",minX:-1,maxX:1,minZ:-3.4,maxZ:-2.9},
    ]}:{}),
  });
  const boss=state.actors.find(a=>a.id==="boss")!;
  const hero=state.actors.find(a=>a.id===heroId)!;
  boss.phase="grab";boss.phaseAge=GRAPPLE_TIMING.grabContact-0.005;
  boss.applied=false;boss.targetId=hero.id;
  boss.attacksStarted=2;boss.lockedHeading=Math.PI;
  hero.phase="hurt";hero.phaseAge=0;
  return {state,boss,hero};
}

test("the exact original Troll grapple timing and pure physical rules are shared",()=>{
  assert.equal(GRAPPLE_TIMING,BOSS_TIMING);
  assert.equal(GRAPPLE_TIMING.grabContact,0.30);
  assert.equal(GRAPPLE_TIMING.throwRelease,0.58);
  assert.equal(GRAPPLE_TIMING.flight,0.90);
  assert.deepEqual(grappleHoldPosition({x:0,z:2},Math.PI),
    {x:Math.sin(Math.PI)*2.15,z:2+Math.cos(Math.PI)*2.15});
  assert.deepEqual(grappleLaunchVelocity({x:0,z:2},{x:0,z:0}),
    {x:0,z:-7.5/0.9});
  assert.equal(grappleEscapeChance(10),0.065);
  assert.equal(grappleEscapeChance(100),0.2);
  assert(grappleEscapes(10,0.01));
  assert(!grappleEscapes(10,0.99));
  assert.deepEqual(
    deterministicGrappleSample("boss","hero",2),
    deterministicGrappleSample("boss","hero",2));
  assert.notEqual(
    deterministicGrappleSample("boss","hero",2),
    deterministicGrappleSample("boss","friend",2));
  assert.throws(()=>grappleLaunchVelocity({x:0,z:0},{x:0,z:0},7.5,0),RangeError);
  assert.throws(()=>grappleEscapes(10,1),RangeError);
});

test("a real group boss grabs, holds and throws exactly one hero, only damaging on landing",()=>{
  const {state,boss,hero}=forcedGrab();
  const first=stepGroupCombat(state);
  assert(first.some(c=>c.kind==="grab"&&c.actorId===boss.id&&c.targetId===hero.id));
  assert.equal(hero.phase,"grabbed");
  assert.equal(hero.grabbedById,boss.id);
  assert.equal(hero.hp,115,"the grab itself must not deal fake fall damage");
  const hold=grappleHoldPosition(boss,boss.lockedHeading);
  assert.equal(hero.x,hold.x);
  assert.equal(hero.z,hold.z);

  boss.phase="throw";
  boss.phaseAge=GRAPPLE_TIMING.throwRelease-0.005;
  boss.applied=false;
  const released=stepGroupCombat(state);
  assert(released.some(c=>c.kind==="throw"&&c.targetId===hero.id));
  assert.equal(hero.phase,"thrown");
  assert.equal(hero.hp,115,"release still does not deal landing damage");
  const startingZ=hero.z;
  for(let i=0;i<80&&hero.phase==="thrown";i++)stepGroupCombat(state);
  assert(hero.z<startingZ-1,"throw must physically move the captured hero");
  const lands=state.events.filter(c=>c.kind==="landing"&&c.targetId===hero.id);
  assert.equal(lands.length,1,"each throw resolves landing exactly once");
  assert.equal(lands[0].amount,39,"42 physical fall damage minus 3 armor");
  assert.equal(hero.hp,76);
  assert.equal(hero.grabbedById,null);
  for(let i=0;i<10;i++)stepGroupCombat(state);
  assert.equal(state.events.filter(c=>c.kind==="landing"&&c.targetId===hero.id).length,1);
});

test("group grapple is counterable and never catches a rolling or escaping hero",()=>{
  const dodge=forcedGrab();
  dodge.hero.phase="roll";dodge.hero.phaseAge=0.20;
  const cues=stepGroupCombat(dodge.state);
  assert(cues.some(c=>c.kind==="dodge"&&c.actorId===dodge.hero.id));
  assert.equal(dodge.hero.grabbedById,null);
  assert.equal(dodge.hero.hp,115);

  // A stable sample < the high-agility cap yields a real escape.
  const escape=forcedGrab("hero43");
  escape.hero.phase="hurt";escape.hero.agility; // the stat is immutable on actors
  assert(deterministicGrappleSample("boss","hero43",2)<0.065);
  const escaped=stepGroupCombat(escape.state);
  assert(escaped.some(c=>c.kind==="escape"&&c.actorId==="hero43"));
  assert.equal(escape.hero.grabbedById,null);
});

test("grapples respect actual stone walls and release a held victim if the boss dies",()=>{
  const w=forcedGrab("hero",true);
  stepGroupCombat(w.state);
  assert.equal(w.hero.phase,"grabbed");
  w.boss.phase="throw";w.boss.phaseAge=GRAPPLE_TIMING.throwRelease-0.005;
  w.boss.applied=false;
  stepGroupCombat(w.state);
  for(let i=0;i<80&&w.hero.phase==="thrown";i++)stepGroupCombat(w.state);
  assert(w.hero.z>-2.9,"a flying hero must not tunnel through solid rock");
  assert.equal(w.state.events.filter(c=>c.kind==="landing").length,1);

  const freed=forcedGrab();
  stepGroupCombat(freed.state);
  freed.boss.hp=0;freed.boss.phase="dead";
  stepGroupCombat(freed.state);
  assert.equal(freed.hero.phase,"move");
  assert.equal(freed.hero.grabbedById,null);
  assert(!freed.state.events.some(c=>c.kind==="landing"),
    "dying before the throw cannot apply invented fall damage");
});

test("real multihero boss encounters run through ordinary GroupCombat and record honest v1 frames",()=>{
  const options={bounds,actors:specs()};
  const a=resolveGroupCombat(options,40);
  const b=resolveGroupCombat({bounds,actors:[...specs()].reverse()},40);
  assert.deepEqual(a.state,b.state);
  assert.deepEqual(a.replay.frames,b.replay.frames);
  assert.deepEqual(a.replay.cues,b.replay.cues);
  assert.equal(a.replay.version,1);
  assert.equal(a.replay.actors.length,4);
  assert(a.replay.frames.length>4);
  assert(a.replay.frames.every(f=>f.actors.length===4));
  assert(a.state.actors.some(actor=>actor.distanceTraveled>0));
  assert(a.replay.cues.some(c=>c.kind==="attack"&&c.actorId==="boss"));
  assert(a.replay.frames.some(f=>f.actors.some(a=>
    a.phase==="grab"||a.phase==="grabbed"||a.phase==="thrown"||a.phase==="grabMiss")),
    "a configurable boss ability should be part of recorded group gameplay");
  const old=resolveGroupCombat({
    bounds,actors:specs().map(a=>a.id==="boss"
      ? {...a,specialAbility:undefined}:a),
  },10);
  assert(old.replay.frames.every(f=>f.actors.every(a=>
    a.phase!=="grab"&&a.phase!=="thrown")),
    "ordinary monsters must not gain free boss attacks");
  assert.throws(()=>createGroupCombat({
    bounds,actors:specs().map(a=>a.id==="boss"
      ? {...a,style:"ranged" as const}:a),
  }),/Grapple/);
  assert.throws(()=>createGroupCombat({
    bounds,actors:specs().map(a=>a.id==="friend"
      ? {...a,grappleDamage:42}:a),
  }),/Throw damage/);
});

test("the existing single-hero Troll fight continues to produce deterministic old-style combat",()=>{
  const options={role:"tank" as const,sword:true,armor:true,
    health:110,maxHealth:110,healingSupplies:1,tacticsSeed:3};
  const a=createCombatPreview(options),b=createCombatPreview(options);
  for(let i=0;i<1500;i++){
    assert.deepEqual(stepCombatPreview(a,1/60),stepCombatPreview(b,1/60));
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
  assert(a.bossAttacks>0);
});
