import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath} from "../../src/game/dungeonLayout.ts";
import {advanceSpatialDungeonPartyStep,emptyLevel7World,
  simulateSpatialDungeonPartyDay,LEVEL7_STEP_BUDGET,type Level7World}
  from "../../src/game/level7Exploration.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

const seed=7351,day=4;
function explorer(index=0):AdventurerState {
  const initial=createGameState(seed).adventurers[index];
  return {...initial,status:"exploring",floor:1,
    health:initial.stats.maxHealth,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    inventory:{...initial.inventory,healing:2}};
}
test("single step is the EXISTING spatial authority with a budget of exactly one",()=>{
  const hero=explorer();
  const world=emptyLevel7World();
  const expected=simulateSpatialDungeonPartyDay([hero],world,seed,day,
    undefined,{maxSteps:1,maxEncounters:1});
  const actual=advanceSpatialDungeonPartyStep([hero],world,seed,day);
  assert.deepEqual(actual,expected);
  const steps=actual.ticks[0].replay.steps;
  assert.equal(steps.filter(s=>s.action==="walk").length,1);
  const map=generateExpeditionLayout(seed,1);
  assert(dungeonNeighbors(map,steps[0]).some(
    next=>next.x===steps[1].x&&next.z===steps[1].z));
  assert.deepEqual(world,emptyLevel7World(),"Never mutate the saved input");
});
test("multiple committed single steps resume from the persisted real tile, independent of replay calls",()=>{
  let hero=explorer();
  let world:Level7World=emptyLevel7World();
  const map=generateExpeditionLayout(seed,1);
  const path=[];
  for(let tick=0;tick<8;tick++){
    const before=world;
    const result=advanceSpatialDungeonPartyStep([hero],world,seed,day);
    assert.deepEqual(result,advanceSpatialDungeonPartyStep([hero],world,seed,day),
      "Same recorded state can never reroll a movement or a monster");
    hero=result.ticks[0].adventurer;
    world=result.world;
    const last=result.ticks[0].replay.steps.at(-1)!;
    path.push(last);
    if(hero.status==="dead"||hero.status==="traveling")break;
    const from=before.heroes.find(p=>p.heroId===hero.id)??map.entrance;
    assert(dungeonNeighbors(map,from).some(p=>p.x===last.x&&p.z===last.z),
      "One event must never teleport across two tiles");
  }
  assert(path.length>=2);
});
test("already settled chest generation cannot mint a second payment on an immediate replay",()=>{
  const map=generateExpeditionLayout(seed,1);
  const chest=map.features.find(f=>f.kind==="treasure");
  assert(chest);
  const near=dungeonNeighbors(map,chest).sort((a,b)=>
    dungeonShortestPath(map,a,chest).length-dungeonShortestPath(map,b,chest).length)[0];
  assert(near);
  const visited=map.tiles.map((tile,index)=>tile!=="wall"?
    index:-1).filter(index=>index>=0).filter(index=>
      index!==chest.z*map.width+chest.x);
  const world:Level7World={
    resolvedFeatureIds:map.features.filter(f=>f.id!==chest.id).map(f=>f.id),
    heroes:[{heroId:explorer().id,...near,visited}],
  };
  const first=advanceSpatialDungeonPartyStep([explorer()],world,seed,day);
  assert.equal(first.ticks[0].replay.steps.some(s=>s.action==="treasure"),true);
  assert.equal(first.ticks[0].gainedLoot,1);
  const next=advanceSpatialDungeonPartyStep(
    [first.ticks[0].adventurer],first.world,seed,day);
  assert.equal(next.ticks[0].gainedLoot,0);
  assert(!next.ticks[0].replay.steps.some(s=>s.action==="treasure"));
  assert.equal(first.world.resolvedFeatureIds.filter(id=>id===chest.id).length,1);
});
test("per-commit bound is validated, but old full-day replay stays exactly unchanged",()=>{
  const hero=explorer(),world=emptyLevel7World();
  assert.throws(()=>simulateSpatialDungeonPartyDay([hero],world,seed,day,
    undefined,{maxSteps:0}),/steps must/);
  assert.throws(()=>simulateSpatialDungeonPartyDay([hero],world,seed,day,
    undefined,{maxSteps:LEVEL7_STEP_BUDGET+1}),/steps must/);
  assert.throws(()=>simulateSpatialDungeonPartyDay([hero],world,seed,day,
    undefined,{maxEncounters:0}),/encounters must/);
  assert.deepEqual(simulateSpatialDungeonPartyDay([hero],world,seed,day),
    simulateSpatialDungeonPartyDay([hero],world,seed,day,
      undefined,{maxSteps:LEVEL7_STEP_BUDGET,maxEncounters:2}));
});
