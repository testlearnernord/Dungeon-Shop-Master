import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath}
  from "../../src/game/dungeonLayout.ts";
import {selectKnownResourceSite,preferKnownDungeonResourceGoal}
  from "../../src/game/dungeonDecisions.ts";
import {chooseKnownResourceStep} from "../../src/game/spatialDungeonExploration.ts";
import {predictDungeonHeroSteps} from "../../src/game/dungeonIntentPreview.ts";

test("greedy heroes actively target adjacent live chests without omniscience",()=>{
  const seed=7351,layout=generateExpeditionLayout(seed,1);
  const chest=layout.features.find(f=>f.kind==="treasure")!;
  const neighbor=dungeonNeighbors(layout,chest)[0];
  assert.ok(neighbor);
  const visited=[neighbor.z*layout.width+neighbor.x];
  const progress={heroId:"adventurer-1",...neighbor,visited};
  const hidden={...progress,x:layout.entrance.x,z:layout.entrance.z,
    visited:[layout.entrance.z*layout.width+layout.entrance.x]};
  const world={resolvedFeatureIds:layout.features.filter(f=>f.id!==chest.id)
    .map(f=>f.id),heroes:[progress]};
  const original=createGameState(seed).adventurers[0];
  const hero={...original,status:"exploring" as const,floor:1 as const,
    health:original.stats.maxHealth,
    traits:{...original.traits,negative:"greedy"}};
  assert.equal(selectKnownResourceSite(layout,progress,world,"treasure")?.id,
    chest.id);
  assert.equal(selectKnownResourceSite(layout,hidden,world,"treasure"),null,
    "Distant spectator-only chests must not leak into hero AI.");
  assert.deepEqual(preferKnownDungeonResourceGoal(
    {goal:"farm",action:"stay"},hero,progress,layout,world),
    {goal:"loot-chest",action:"stay"});
  assert.deepEqual(chooseKnownResourceStep(layout,progress,chest),
    {x:chest.x,z:chest.z});
  const route=predictDungeonHeroSteps(layout,
    {...progress,id:hero.id,activity:"exploring",inCombat:false,
      plannedAction:"stay" as const,goal:"loot-chest"},world.resolvedFeatureIds);
  assert.deepEqual(route[0],{x:chest.x,z:chest.z});
});

test("cleared, unknown and unsafe sites cannot become objectives",()=>{
  const seed=7351,layout=generateExpeditionLayout(seed,1);
  const ghoul=layout.features.find(f=>f.kind==="monster")!;
  const progress={heroId:"adventurer-1",
    ...dungeonNeighbors(layout,ghoul)[0],visited:[] as number[]};
  const world={resolvedFeatureIds:layout.features.map(f=>f.id),heroes:[progress]};
  assert.equal(selectKnownResourceSite(layout,progress,world,"monster"),null);
  const h=createGameState(seed).adventurers[0];
  const hero={...h,health:Math.floor(h.stats.maxHealth*.40),
    status:"exploring" as const,floor:1 as const};
  assert.deepEqual(preferKnownDungeonResourceGoal(
    {goal:"caution",action:"stay"},hero,progress,layout,world),
    {goal:"caution",action:"stay"});
});

test("route to a known remote resource follows visited corridors only",()=>{
  const seed=7351,layout=generateExpeditionLayout(seed,1);
  const chest=layout.features.find(f=>f.kind==="treasure")!;
  const start=layout.entrance;
  const route=dungeonShortestPath(layout,start,chest);
  assert.ok(route.length>1);
  const progress={heroId:"adventurer-1",...start,
    visited:route.map(p=>p.z*layout.width+p.x)};
  assert.deepEqual(chooseKnownResourceStep(layout,progress,chest),route[1]);
});
