import assert from "node:assert/strict";
import {test} from "node:test";
import {GroupCombatSoundCursor} from "../../src/game/groupCombatSfx.ts";
import type {CombatantSpec,GroupCombatCue} from "../../src/game/groupCombat.ts";

const actors:CombatantSpec[]=[
  {id:"ghoul",team:"monsters",role:"monster",style:"melee",
   x:2,z:0,hp:50,maxHp:50,damage:7,armor:1,speed:3,reach:1.5},
  {id:"hero",team:"heroes",role:"tank",style:"melee",
   x:0,z:0,hp:80,maxHp:80,damage:9,armor:3,speed:3,reach:1.5},
  {id:"troll",team:"monsters",role:"monster",style:"melee",
   x:5,z:0,hp:200,maxHp:200,damage:15,armor:6,speed:2,reach:2,
   specialAbility:"grapple-throw"},
];
const c=(t:number,actorId:string,kind:GroupCombatCue["kind"],
  targetId?:string,amount?:number):GroupCombatCue=>
  ({t,actorId,kind,...(targetId?{targetId}:{}),
    ...(amount!==undefined?{amount}:{})});
const ids=(cursor:GroupCombatSoundCursor,events:GroupCombatCue[],t:number)=>
  cursor.advance(events,t).map(e=>e.cue);

test("recorded attack outcomes distinguish claw impact, whiff, parry and death",()=>{
  const cues=[
    c(.1,"ghoul","attack","hero"),
    c(.4,"ghoul","miss","hero"),
    c(.7,"ghoul","attack","hero"),
    c(1,"hero","dodge","ghoul"),
    c(1.3,"ghoul","attack","hero"),
    c(1.6,"ghoul","hit","hero",8),
    c(2,"hero","hit","ghoul",5),
    c(2.2,"hero","hit","ghoul",50),
    c(2.2,"ghoul","death","hero"),
  ];
  const cursor=new GroupCombatSoundCursor(actors,0);
  assert.deepEqual(ids(cursor,cues,.1),["ghoul-aggro"]);
  assert.deepEqual(ids(cursor,cues,.4),["ghoul-claw-whiff"]);
  assert.deepEqual(ids(cursor,cues,.7),["ghoul-attack"]);
  assert.deepEqual(ids(cursor,cues,1),["ghoul-claw-whiff"]);
  assert.deepEqual(ids(cursor,cues,1.3),[
    "ghoul-attack","ghoul-leap-takeoff","ghoul-leap-air"]);
  assert.deepEqual(ids(cursor,cues,1.6),["ghoul-claw-hit","ghoul-leap-land"]);
  assert.deepEqual(ids(cursor,cues,2),["ghoul-hurt"]);
  assert.deepEqual(ids(cursor,cues,2.2),["ghoul-death"]);
});

test("defender parry only plays Ghoul whiff/stagger, no invented hit",()=>{
  const cues=[c(.1,"hero","parry","ghoul")];
  assert.deepEqual(ids(new GroupCombatSoundCursor(actors,0),cues,.1),
    ["ghoul-claw-whiff","ghoul-stagger"]);
});

test("seek, late join and duplicate render frames never replay historical sounds",()=>{
  const cues=[c(.1,"ghoul","attack","hero"),
    c(.4,"ghoul","miss","hero"),
    c(1.5,"ghoul","attack","hero")];
  const cursor=new GroupCombatSoundCursor(actors,.4);
  assert.deepEqual(ids(cursor,cues,.4),[]);
  assert.deepEqual(ids(cursor,cues,.4),[]);
  assert.deepEqual(ids(cursor,cues,1.5),[]); // large forward seek
  assert.deepEqual(ids(cursor,cues,.2),[]); // reverse seek
  assert.deepEqual(ids(cursor,cues,.4),["ghoul-claw-whiff"]);
  assert.deepEqual(ids(cursor,cues,.4),[]);
});

test("Troll attack, hit, hurt and death use original boss cues, never Ghoul vocals",()=>{
  const cues=[c(.1,"troll","attack","hero"),
    c(.4,"troll","hit","hero",7),
    c(.7,"hero","hit","troll",8),
    c(.8,"troll","death","hero")];
  const cursor=new GroupCombatSoundCursor(actors,0);
  assert.deepEqual(ids(cursor,cues,.1),["troll-grunt"]);
  assert.deepEqual(ids(cursor,cues,.4),["troll-impact","hero-hurt"]);
  assert.deepEqual(ids(cursor,cues,.7),["boss-hurt"]);
  assert.deepEqual(ids(cursor,cues,.8),["troll-death"]);
});

test("Troll grapples, throws, defenses and landing play authentic action cues",()=>{
  const cues=[
    c(.1,"hero","parry","troll"),
    c(.2,"hero","dodge","troll"),
    c(.3,"troll","grab","hero"),
    c(.4,"troll","throw","hero"),
    c(.5,"troll","landing","hero",30),
    c(.6,"hero","escape","troll"),
  ];
  const cursor=new GroupCombatSoundCursor(actors,0);
  assert.deepEqual(ids(cursor,cues,.1),["shield-parry","stagger"]);
  assert.deepEqual(ids(cursor,cues,.2),["dodge","troll-impact"]);
  assert.deepEqual(ids(cursor,cues,.3),["troll-grunt","hero-hurt"]);
  assert.deepEqual(ids(cursor,cues,.4),["troll-swing"]);
  assert.deepEqual(ids(cursor,cues,.5),["troll-impact","hero-hurt"]);
  assert.deepEqual(ids(cursor,cues,.6),["dodge"]);
});

test("committed lava contact triggers the existing environment sample once",()=>{
  const cues=[c(.1,"hero","lava",undefined,12)];
  const cursor=new GroupCombatSoundCursor(actors,0);
  assert.deepEqual(ids(cursor,cues,.1),["lava-burn"]);
  assert.deepEqual(ids(cursor,cues,.1),[],
    "repaint must not replay a burn");
});
