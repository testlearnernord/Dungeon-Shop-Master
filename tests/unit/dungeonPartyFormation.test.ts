import assert from "node:assert/strict";
import test from "node:test";
import type {SpatialDungeonReplay} from "../../src/game/spatialDungeonExploration.ts";
import {
  buildDungeonPlayback,type DungeonPlaybackSnapshot,
} from "../../src/game/dungeonReplayPlayback.ts";
import {
  recordedTemporaryPartyVisuals,dungeonReplayFocusIds,
} from "../../src/game/dungeonReplayCast.ts";
import {
  recordedTemporaryPartyFormation,recordedPartyMemberAlive,
} from "../../src/game/dungeonPartyFormation.ts";

const heroes=["adventurer-1","adventurer-2","adventurer-3"];
const replay=(count:1|2|3=3):SpatialDungeonReplay=>{
  const ids=heroes.slice(0,count);
  return {
    version:1,day:5,heroId:ids[0],floor:1,
    appearance:{role:"tank",equipment:{weapon:"Iron Sword",armor:"Leather Vest"}},
    ...(count>1?{
      partyMemberIds:ids,
      partyAppearances:ids.map((id,i)=>({
        id,role:(["tank","healer","DPS"] as const)[i],
        equipment:{
          weapon:i===1?null:"Iron Sword" as const,
          armor:i===2?null:"Leather Vest" as const,
        },
      })),
    }:{}),
    knownAtStart:[0],
    steps:[
      {x:2,z:2,t:0,action:"enter",hp:100},
      {x:3,z:2,t:1,action:"walk",hp:100},
      {x:3,z:3,t:2,action:"walk",hp:100},
      {x:3,z:3,t:2.2,action:"complete",hp:100},
    ],
    encounters:[],outcome:"completed",
  };
};
const snap=(time:number,action="walk"):DungeonPlaybackSnapshot=>({
  time,duration:3,x:2+time,z:2,hp:100,action,
  known:new Set<number>(),resolved:new Set<string>(),
  encounter:null,frame:null,finished:false,percent:time/3,
});

test("all three party members walk as distinct actors on one actual route",()=>{
  const record=replay(3),before=structuredClone(record);
  const timeline=buildDungeonPlayback(record);
  assert.deepEqual(recordedTemporaryPartyVisuals(record).map(x=>x.id),heroes);
  assert.deepEqual(recordedTemporaryPartyVisuals(record).map(x=>x.equipment),[
    {weapon:"Iron Sword",armor:"Leather Vest"},
    {weapon:null,armor:"Leather Vest"},
    {weapon:"Iron Sword",armor:null},
  ]);
  const along=recordedTemporaryPartyFormation(record,timeline,snap(0.4));
  assert.equal(along.length,3);
  assert(along.every(a=>a.walking));
  assert.equal(new Set(along.map(a=>a.id)).size,3);
  assert.equal(new Set(along.map(a=>a.offsetZ)).size,3,
    "Companions should have visible formation separation");
  assert(along.every(a=>Math.hypot(a.offsetX,a.offsetZ)<0.8),
    "Decorative offsets must never invent another grid step");
  assert.deepEqual(dungeonReplayFocusIds(record,snap(0.4)),heroes);
  const second=recordedTemporaryPartyFormation(record,timeline,snap(1.5));
  assert.notDeepEqual(along.map(a=>[a.offsetX,a.offsetZ]),
    second.map(a=>[a.offsetX,a.offsetZ]),
    "A real turn rotates the local formation");
  assert.deepEqual(recordedTemporaryPartyFormation(record,timeline,snap(0.4)),along,
    "The same saved timestamp produces the same visual formation");
  assert.deepEqual(record,before,"No replay state is mutated");
});

test("a second member's own replay POV preserves the same physical formation",()=>{
  const first=replay(2),second={...first,
    heroId:heroes[1],appearance:{
      role:"healer" as const,equipment:{weapon:null,armor:"Leather Vest" as const},
    },
  };
  const timeline=buildDungeonPlayback(first);
  const camera1=recordedTemporaryPartyFormation(first,timeline,snap(0.4));
  const camera2=recordedTemporaryPartyFormation(second,timeline,snap(0.4));
  assert.deepEqual(camera1,camera2);
  assert.deepEqual(dungeonReplayFocusIds(second,snap(0.4)),
    [heroes[1],heroes[0]]);
});

test("legacy party records without appearances never invent an unrecorded companion",()=>{
  const first=replay(3);
  const old={...first,partyAppearances:undefined};
  assert.deepEqual(recordedTemporaryPartyVisuals(old).map(a=>a.id),
    [heroes[0]],"No battle footage means a companion role and gear is unknown");
  assert.deepEqual(recordedTemporaryPartyFormation(old,buildDungeonPlayback(old),
    snap(0.4)),[]);
  const solo=replay(1);
  assert.deepEqual(recordedTemporaryPartyVisuals(solo),[]);
  assert.deepEqual(dungeonReplayFocusIds(solo,snap(0.4)),[solo.heroId]);
});

test("a recorded casualty never reappears as a walking party member",()=>{
  const first=replay(2),timeline=buildDungeonPlayback(first);
  assert.equal(recordedPartyMemberAlive(timeline,snap(0.5),heroes[1]),true);
  assert.equal(recordedPartyMemberAlive(timeline,snap(2),heroes[1]),true);
});
