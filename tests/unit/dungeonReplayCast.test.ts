import assert from "node:assert/strict";
import test from "node:test";
import { resolveGroupCombat } from "../../src/game/groupCombat.ts";
import { generateDungeonLayout } from "../../src/game/dungeonLayout.ts";
import { buildDungeonPlayback, dungeonPlaybackAt } from "../../src/game/dungeonReplayPlayback.ts";
import {
  dungeonReplayCast, dungeonReplayFocusIds, visibleDungeonCombatActors,
} from "../../src/game/dungeonReplayCast.ts";
import type { SpatialDungeonReplay } from "../../src/game/spatialDungeonExploration.ts";

const encounter = resolveGroupCombat({
  bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
  actors:[
    {id:"hero-1",team:"heroes",role:"tank",style:"melee",
      x:-4,z:0,hp:120,maxHp:120,damage:14,armor:5,speed:3,reach:1.8},
    {id:"hero-2",team:"heroes",role:"healer",style:"ranged",
      x:-3,z:2,hp:70,maxHp:70,damage:9,armor:2,speed:3,reach:2,
      equipment:{weapon:"Iron Sword",armor:"Leather Vest"}},
    {id:"elite",team:"monsters",role:"monster",style:"melee",
      x:2,z:0,hp:230,maxHp:230,damage:20,armor:8,
      speed:2.4,reach:2,radius:1.0,specialAbility:"grapple-throw"},
  ],
},12).replay;

function fixture(): SpatialDungeonReplay {
  return {
    version:1,day:5,heroId:"hero-1",floor:7,
    appearance:{role:"tank",equipment:{weapon:"Iron Sword",armor:"Leather Vest"}},
    steps:[
      {x:1,z:1,t:0,action:"enter",hp:120},
      {x:2,z:1,t:1,action:"walk",hp:120},
      {x:2,z:1,t:1.1,action:"combat",featureId:"monster-0",hp:40},
      {x:2,z:1,t:1.2,action:"retreat",hp:40},
    ],
    encounters:[{featureId:"monster-0",x:2,z:1,combat:encounter}],
    outcome:"retreat",
  };
}

test("all genuine group participants project into saved dungeon footage without a second fight",()=>{
  const replay=fixture(),layout=generateDungeonLayout(7351,7);
  const before=structuredClone(replay);
  const timeline=buildDungeonPlayback(replay);
  const start=dungeonPlaybackAt(replay,timeline,layout,0);
  assert.deepEqual(visibleDungeonCombatActors(start),[]);
  assert.deepEqual(dungeonReplayFocusIds(replay,start),["hero-1"]);
  const combat=timeline.segments.find(segment=>segment.kind==="combat")!;
  const during=dungeonPlaybackAt(replay,timeline,layout,combat.start+0.12);
  const cast=dungeonReplayCast(replay);
  assert.deepEqual(new Set(cast.map(actor=>actor.id)),
    new Set(["hero-1","hero-2","elite"]));
  const visible=visibleDungeonCombatActors(during);
  assert.equal(visible.length,3);
  assert.deepEqual(new Set(visible.map(actor=>actor.id)),
    new Set(["hero-1","hero-2","elite"]));
  assert.equal(visible.find(actor=>actor.id==="elite")?.specialAbility,"grapple-throw");
  assert.equal(visible.find(actor=>actor.id==="elite")?.radius,1);
  assert.deepEqual(cast.find(actor=>actor.id==="hero-2")?.equipment,
    {weapon:"Iron Sword",armor:"Leather Vest"},
    "The renderer must get a genuine historical companion gear snapshot");
  assert.deepEqual(visible.map(a=>a.hp),
    during.frame!.actors.map(a=>a.hp));
  assert.deepEqual(dungeonReplayFocusIds(replay,during),
    ["hero-1",...during.frame!.actors.map(a=>a.id).filter(id=>id!=="hero-1")]);
  assert.deepEqual(dungeonPlaybackAt(replay,timeline,layout,combat.start+0.12),during);
  assert.deepEqual(replay,before,"Playback is a read-only historical projection");
  const finished=dungeonPlaybackAt(replay,timeline,layout,timeline.duration);
  assert.deepEqual(dungeonReplayFocusIds(replay,finished),["hero-1"],
    "An unseen fight must not leak identities into later map footage");
});
