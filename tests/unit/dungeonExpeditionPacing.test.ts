import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {
  generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath,
} from "../../src/game/dungeonLayout.ts";
import {
  LEVEL7_MAX_ENCOUNTERS,LEVEL7_STEP_BUDGET,emptyLevel7World,
  simulateSpatialDungeonPartyDay,simulateSpatialDungeonDay,
} from "../../src/game/level7Exploration.ts";
import {buildDungeonPlayback,dungeonPlaybackAt} from "../../src/game/dungeonReplayPlayback.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

const seed=7351;
function hero(index:number):AdventurerState {
  const initial=createGameState(seed).adventurers[index];
  return {...initial,status:"exploring",floor:1,
    role:(["tank","healer","DPS"] as const)[index],
    health:initial.stats.maxHealth,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    inventory:{...initial.inventory,healing:2}};
}
test("longer real day captures 36 actual legal walks, never synthetic idle footage",()=>{
  const map=generateExpeditionLayout(seed,1);
  const allCleared={
    ...emptyLevel7World(),resolvedFeatureIds:map.features.map(f=>f.id),
  };
  const first=simulateSpatialDungeonDay(hero(0),allCleared,seed,2);
  const again=simulateSpatialDungeonDay(hero(0),allCleared,seed,2);
  assert.deepEqual(first,again);
  assert.equal(LEVEL7_STEP_BUDGET,36);
  const walks=first.replay.steps.filter(s=>s.action==="walk");
  assert.equal(walks.length,LEVEL7_STEP_BUDGET);
  assert(first.replay.encounters.length===0);
  const timeline=buildDungeonPlayback(first.replay);
  assert(timeline.duration>=30,"Longer footage must come from actual saved movement");
  assert.equal(timeline.segments.filter(s=>s.kind==="walk").length,walks.length);
  assert.equal(timeline.segments.filter(s=>s.kind==="combat").length,0);
  const final=dungeonPlaybackAt(first.replay,timeline,map,timeline.duration);
  assert(final.finished);
  assert.equal(final.hp,first.adventurer.health);
  assert.equal(final.known.size,first.world.heroes[0].visited.length);
});

test("one real committed day can contain two DISTINCT fights without repeated rewards",()=>{
  const map=generateExpeditionLayout(seed,1);
  const monsters=map.features.filter(f=>f.kind==="monster");
  const pairs=monsters.flatMap((a,i)=>monsters.slice(i+1).map(b=>({
    a,b,path:dungeonShortestPath(map,a,b),
  }))).filter(pair=>pair.path.length>=2)
    .sort((x,y)=>x.path.length-y.path.length);
  assert(pairs.length>0);
  const {a,b}=pairs[0];
  const starting=dungeonNeighbors(map,a)[0];
  const hidden=new Set([a.z*map.width+a.x,b.z*map.width+b.x]);
  const initialVisited=map.tiles.map((tile,index)=>
    tile!=="wall"&&!hidden.has(index)?index:-1).filter(index=>index>=0);
  assert(initialVisited.includes(starting.z*map.width+starting.x));
  const heroes=[hero(0),hero(1),hero(2)];
  const world={
    resolvedFeatureIds:map.features.filter(f=>f.id!==a.id&&f.id!==b.id)
      .map(f=>f.id),
    heroes:heroes.map(h=>({heroId:h.id,...starting,visited:initialVisited})),
  };
  const first=simulateSpatialDungeonPartyDay(heroes,world,seed,2,
    new Set(heroes.map(h=>h.id)));
  assert.deepEqual(first,simulateSpatialDungeonPartyDay(heroes,world,seed,2,
    new Set(heroes.map(h=>h.id))),"No random second payout from replay");
  assert.equal(first.ticks.length,3);
  assert.equal(first.ticks[0].replay.encounters.length,LEVEL7_MAX_ENCOUNTERS);
  for(const tick of first.ticks){
    const ids=tick.replay.encounters.map(e=>e.featureId);
    assert.equal(new Set(ids).size,2);
    assert.deepEqual(ids,first.ticks[0].replay.encounters.map(e=>e.featureId));
    assert.equal(tick.replay.steps.filter(s=>s.action==="combat").length,2);
    assert(tick.replay.encounters.every(e=>e.combat.actors.every(actor=>
      actor.specialAbility!=="grapple-throw")),
      "Ordinary monsters must never copy the Cave Troll's signature throw");
  }
  const gold=first.ticks.reduce((sum,t)=>sum+t.gainedGold,0);
  assert.equal(gold,4,"Each weak monster generation pays 2g once per party");
  assert.equal(first.ticks.reduce((sum,t)=>sum+t.defeatedMonsters,0),2);
  const tape=first.ticks[0].replay;
  const timeline=buildDungeonPlayback(tape);
  assert.equal(timeline.segments.filter(s=>s.kind==="combat").length,2);
  assert.equal(tape.encounters.length,2);
  assert.deepEqual(first.world.resolvedFeatureIds.filter(id=>
    id===a.id||id===b.id).sort(),[a.id,b.id].sort());

  const base=createGameState(seed);
  const saved={
    ...base,day:2,
    shopEconomy:{...base.shopEconomy,
      dailySales:{...base.shopEconomy.dailySales,day:2}},
    adventurers:base.adventurers.map(h=>first.ticks.find(t=>
      t.adventurer.id===h.id)?.adventurer??h),
    earlyDungeonWorlds:[{floor:1 as const,world:first.world}],
    events:[...base.events,...first.ticks.map(t=>({
      id:"day-2:"+t.adventurer.id+":dungeon-exploration",
      day:2,type:"dungeon-exploration" as const,
      adventurerId:t.adventurer.id,message:"Recorded expedition.",
      dungeonReplay:t.replay,
    }))],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(saved))),saved,
    "Unchanged v13 envelope must validate TWO genuine encounters");
});

test("historical one-encounter recordings remain playable and verify unchanged",()=>{
  const map=generateExpeditionLayout(seed,1);
  const monster=map.features.find(f=>f.kind==="monster")!;
  const approach=dungeonNeighbors(map,monster)[0];
  const hidden=monster.z*map.width+monster.x;
  const world={
    resolvedFeatureIds:map.features.filter(f=>f.id!==monster.id).map(f=>f.id),
    heroes:[{heroId:hero(0).id,...approach,
      visited:map.tiles.map((tile,i)=>tile!=="wall"&&i!==hidden?i:-1)
        .filter(i=>i>=0)}],
  };
  const tick=simulateSpatialDungeonDay(hero(0),world,seed,2);
  assert.equal(tick.replay.encounters.length,1);
  const tape=structuredClone(tick.replay);
  const timeline=buildDungeonPlayback(tape);
  assert.equal(timeline.segments.filter(s=>s.kind==="combat").length,1);
  assert.deepEqual(tick.replay,tape);
});
