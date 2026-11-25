import assert from "node:assert/strict";
import test from "node:test";
import {
  combatSegmentBox, combatSegmentCircle, traceCombatProjectile,
} from "../../src/game/combatProjectile.ts";
import { createGroupCombat, stepGroupCombat } from "../../src/game/groupCombat.ts";

test("swept projectiles hit enemies across long steps rather than tunneling",()=>{
  const trace=traceCombatProjectile(
    {x:0,z:0},{x:12,z:0},[
      {id:"monster",x:5,z:0,radius:0.5},
    ]);
  assert.deepEqual(trace,{end:{x:12,z:0},hitId:"monster",blocked:false});
  assert.equal(combatSegmentCircle({x:0,z:0},{x:12,z:0},
    {x:5,z:0},0.5),4.5/12);
  assert.equal(combatSegmentCircle({x:0,z:0},{x:12,z:0},
    {x:5,z:3},0.5),null);
});

test("walls outrank enemies, equal-time shots are stable and empty shots move",()=>{
  const wall={minX:3,maxX:4,minZ:-1,maxZ:1};
  const target={id:"troll",x:6,z:0,radius:1};
  const blocked=traceCombatProjectile({x:0,z:0},{x:12,z:0},[target],[wall]);
  assert.equal(blocked.blocked,true);
  assert.equal(blocked.hitId,null);
  assert.equal(combatSegmentBox({x:0,z:0},{x:12,z:0},wall),0.25);
  const tie=[
    {id:"z",x:5,z:0,radius:1},
    {id:"a",x:5,z:0,radius:1},
  ];
  assert.equal(traceCombatProjectile({x:0,z:0},{x:10,z:0},tie).hitId,"a");
  assert.equal(traceCombatProjectile({x:0,z:0},{x:10,z:0},
    [...tie].reverse()).hitId,"a");
  assert.deepEqual(traceCombatProjectile({x:0,z:0},{x:1,z:0},[target]),
    {end:{x:1,z:0},hitId:null,blocked:false});
  assert.throws(()=>traceCombatProjectile({x:0,z:0},{x:NaN,z:0},[]),RangeError);
  assert.throws(()=>traceCombatProjectile({x:0,z:0},{x:1,z:0},
    [{id:"bad",x:0,z:0,radius:0}]),RangeError);
});

test("ordinary combat projectiles still respect physical walls and do not damage allies",()=>{
  const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};
  const actors=[
    {id:"hero",team:"heroes" as const,role:"DPS" as const,style:"ranged" as const,
      x:-5,z:0,hp:60,maxHp:60,damage:12,armor:0,speed:0,reach:1.5},
    {id:"friend",team:"heroes" as const,role:"tank" as const,style:"melee" as const,
      x:-3,z:2,hp:80,maxHp:80,damage:6,armor:4,speed:0,reach:1.5},
    {id:"monster",team:"monsters" as const,role:"monster" as const,style:"melee" as const,
      x:5,z:0,hp:80,maxHp:80,damage:9,armor:0,speed:0,reach:1.5},
  ];
  const world=createGroupCombat({bounds,actors,obstacles:[
    {id:"wall",minX:-.5,maxX:.5,minZ:-3,maxZ:3},
  ]});
  world.projectiles.push({ownerId:"hero",team:"heroes",
    x:-2,z:0,vx:300,vz:0,damage:40,ttl:1});
  const batch=stepGroupCombat(world);
  assert(batch.some(cue=>cue.kind==="blocked"));
  assert.equal(world.actors.find(a=>a.id==="monster")?.hp,80);
  assert.equal(world.actors.find(a=>a.id==="friend")?.hp,80);
});

test("a projectile hits the actual Troll through the shared swept collision motor",()=>{
  const make=()=>{
    const s=createGroupCombat({bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},actors:[
      {id:"hero",team:"heroes",role:"healer",style:"ranged",x:0,z:-3,
        hp:60,maxHp:60,damage:12,armor:0,speed:0,reach:1.6},
      {id:"boss",team:"monsters",role:"monster",style:"melee",x:0,z:0,
        hp:280,maxHp:280,damage:33,armor:10,speed:0,reach:1.8,
        radius:1.8,specialAbility:"grapple-throw"},
    ]});
    for(const a of s.actors)a.cooldown=100;
    s.projectiles.push({ownerId:"hero",team:"heroes",x:0,z:-3,vx:0,vz:120,damage:12,ttl:1});
    return s;
  };
  const a=make(),b=make();
  for(let i=0;i<15;i++)assert.deepEqual(stepGroupCombat(a),stepGroupCombat(b));
  assert.deepEqual(a,b);
  assert(a.actors.find(a=>a.id==="boss")!.hp<280);
  assert(a.events.some(e=>e.kind==="hit"&&e.actorId==="hero"&&e.targetId==="boss"));
});
