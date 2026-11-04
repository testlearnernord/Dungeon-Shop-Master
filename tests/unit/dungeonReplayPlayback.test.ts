import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDungeonPlayback, dungeonPlaybackAt, dungeonVisibleTiles,
} from "../../src/game/dungeonReplayPlayback.ts";
import { generateDungeonLayout, dungeonNeighbors } from "../../src/game/dungeonLayout.ts";
import { simulateLevel7Day, emptyLevel7World } from "../../src/game/level7Exploration.ts";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

function heroForReplay() {
  const original=createGameState(7351).adventurers[0];
  return {...original, status:"expedition" as const, floor:7 as const,
    level6Permit:true, health:original.stats.maxHealth};
}

test("fog starts from historical knowledge and never leaks future walked tiles",()=>{
  const layout=generateDungeonLayout(7351,7);
  const hero=heroForReplay();
  const result=simulateLevel7Day(hero,emptyLevel7World(),7351,5);
  const replay=result.replay;
  assert.deepEqual(replay.knownAtStart,
    [layout.entrance.z*layout.width+layout.entrance.x]);
  assert.deepEqual(replay.resolvedAtStart,[]);
  const timeline=buildDungeonPlayback(replay);
  assert(timeline.duration>0);
  const first=dungeonPlaybackAt(replay,timeline,layout,0);
  const last=dungeonPlaybackAt(replay,timeline,layout,timeline.duration);
  assert.equal(first.finished,false);
  assert.equal(first.known.size,1);
  assert(last.known.size>first.known.size);
  assert.equal(last.finished,true);
  assert.equal(last.percent,1);
  assert.equal(last.hp,result.adventurer.health);
  assert.equal(first.hp,hero.health);
  assert.deepEqual(dungeonPlaybackAt(replay,timeline,layout,0),first,
    "Seeking backward must reconstruct historical vision without state mutation");
  const revealed=dungeonVisibleTiles(layout,first.known);
  const total=layout.width*layout.height;
  assert(revealed.size<total/3,"A novice must not see all corridors");
  for(const key of first.known)assert(revealed.has(key));
  assert.deepEqual(replay,result.replay);
});

test("a replay uncovers and resolves a chest only at the recorded action",()=>{
  const layout=generateDungeonLayout(7351,7);
  const chest=layout.features.find(x=>x.kind==="treasure")!;
  const approach=dungeonNeighbors(layout,chest)[0];
  const idx=chest.z*layout.width+chest.x;
  const allVisited=layout.tiles.map((tile,index)=>tile!=="wall"&&index!==idx?index:-1)
    .filter(x=>x>=0);
  const hero=heroForReplay();
  const result=simulateLevel7Day(hero,{
    resolvedFeatureIds:layout.features.filter(f=>f.id!==chest.id).map(f=>f.id),
    heroes:[{heroId:hero.id,x:approach.x,z:approach.z,visited:allVisited}],
  },7351,12);
  assert(result.replay.steps.some(s=>s.action==="treasure"&&s.featureId===chest.id));
  const timeline=buildDungeonPlayback(result.replay);
  const beginning=dungeonPlaybackAt(result.replay,timeline,layout,0);
  const end=dungeonPlaybackAt(result.replay,timeline,layout,timeline.duration);
  assert(!beginning.resolved.has(chest.id));
  assert(end.resolved.has(chest.id));
  assert.equal(end.hp,result.adventurer.health);
  assert.equal(dungeonPlaybackAt(result.replay,timeline,layout,0).resolved.has(chest.id),false);
});

test("combat playback uses real recorded actor HP and frame positions, not a second fight",()=>{
  const layout=generateDungeonLayout(7351,7);
  const monster=layout.features.find(x=>x.kind==="monster")!;
  const approach=dungeonNeighbors(layout,monster)[0];
  const index=monster.z*layout.width+monster.x;
  const visited=layout.tiles.map((tile,i)=>tile!=="wall"&&i!==index?i:-1)
    .filter(i=>i>=0);
  const hero={...heroForReplay(), role:"tank" as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"}};
  const world={
    resolvedFeatureIds:layout.features.filter(f=>f.id!==monster.id).map(f=>f.id),
    heroes:[{heroId:hero.id,x:approach.x,z:approach.z,visited}],
  };
  const result=simulateLevel7Day(hero,world,7351,9);
  assert.equal(result.replay.encounters.length,1);
  const recorded=result.replay.encounters[0].combat;
  const timeline=buildDungeonPlayback(result.replay);
  const segment=timeline.segments.find(s=>s.kind==="combat")!;
  assert(segment);
  const during=dungeonPlaybackAt(result.replay,timeline,layout,segment.start+0.05);
  assert.equal(during.action,"combat");
  assert(during.frame);
  assert(during.encounter);
  assert.equal(during.frame.actors.length,2);
  const firstRecorded=recorded.frames[0];
  assert.equal(during.frame.actors.find(x=>x.id===hero.id)?.hp,
    firstRecorded.actors.find(x=>x.id===hero.id)?.hp);
  const nearEnd=dungeonPlaybackAt(result.replay,timeline,layout,segment.end-0.001);
  assert(nearEnd.frame);
  const stop=dungeonPlaybackAt(result.replay,timeline,layout,timeline.duration);
  assert.equal(stop.hp,result.adventurer.health);
  assert.equal(stop.encounter,null);
  assert.deepEqual(result.replay.encounters[0].combat,recorded);
  assert.deepEqual(dungeonPlaybackAt(result.replay,timeline,layout,segment.start+0.05),during);
});

test("version 8 optional historical fog snapshots round-trip and reject forged indices",()=>{
  const initial=createGameState(7351);
  const first={...initial,dungeonFloors:[{floor:6,cleared:true}],
    adventurers:initial.adventurers.map((h,i)=>i===0
      ?{...h,status:"expedition" as const,floor:7 as const,level6Permit:true}
      :h)};
  const second=advanceDay(first).state;
  const replay=second.events.find(e=>e.type==="level7-exploration")?.level7Replay;
  assert(replay?.knownAtStart?.length);
  assert.deepEqual(parseSave(JSON.stringify(createSave(second))),second);
  const forged=structuredClone(createSave(second));
  const last=forged.payload.events.find(e=>e.type==="level7-exploration")!;
  (last.level7Replay as any).knownAtStart=[0];
  assert.throws(()=>parseSave(JSON.stringify(forged)),/knownAtStart/);
  const older=structuredClone(createSave(second));
  const prev=older.payload.events.find(e=>e.type==="level7-exploration")!;
  delete (prev.level7Replay as any).knownAtStart;
  delete (prev.level7Replay as any).resolvedAtStart;
  assert.doesNotThrow(()=>parseSave(JSON.stringify(older)),
    "Previously saved v8 records without fog baselines stay compatible");
});
