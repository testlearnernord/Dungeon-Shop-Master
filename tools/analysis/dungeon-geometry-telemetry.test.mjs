import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {describeDungeonGeometry,createDungeonGeometryTelemetry} from "./dungeon-geometry-telemetry.mjs";

test("production floors have deterministic connected geometry measurements",()=>{
  for(const seed of [42,7351,9321,2026]){
    for(let floor=1;floor<=9;floor++){
      const map=generateExpeditionLayout(seed,floor),a=describeDungeonGeometry(map);
      assert.deepEqual(a,describeDungeonGeometry(generateExpeditionLayout(seed,floor)));
      assert.equal(a.walkableTiles,a.roomTiles+a.corridorTiles);
      assert(a.gridCycleRank>=0);
      assert(a.stairDistance>0);
      assert(a.emptyDeadEndTiles<=a.deadEndTiles);
    }
  }
});

test("heatmap counts only present living heroes, once per sampled tick",()=>{
  const map=generateExpeditionLayout(42,1);
  const p={...map.entrance};
  const telemetry=createDungeonGeometryTelemetry(new Map([[1,map]]));
  const state={worldClock:{tick:0},adventurers:[
    {id:"a",floor:1,status:"exploring"},{id:"b",floor:2,status:"exploring"},
    {id:"c",floor:1,status:"dead"},{id:"d",floor:"shop",status:"shopping"}],
    dungeonWorlds:[{floor:1,world:{heroes:["a","b","c","d"].map(heroId=>({heroId,...p}))}}]};
  const before=JSON.stringify(state);
  telemetry.sample(state);telemetry.sample(state);
  assert.equal(JSON.stringify(state),before);
  telemetry.sample({...state,worldClock:{tick:200}});
  const report=telemetry.report(),floor=report.floors[0];
  assert.equal(report.sampleCount,2);
  assert.equal(floor.heroSamples,2);
  assert.equal(floor.stationarySamples,1);
  assert.equal(floor.occupiedTiles,1);
  assert.equal(floor.heatmap[p.z*map.width+p.x],2);
  assert.equal(floor.heatmap.reduce((a,b)=>a+b,0),2);
});

test("invalid live positions fail the offline audit rather than silently vanish",()=>{
  const map=generateExpeditionLayout(42,1);
  const telemetry=createDungeonGeometryTelemetry(new Map([[1,map]]));
  assert.throws(()=>telemetry.sample({worldClock:{tick:0},
    adventurers:[{id:"a",floor:1,status:"exploring"}],
    dungeonWorlds:[{floor:1,world:{heroes:[{heroId:"a",x:0,z:0}]}}]}),/Invalid committed/);
});
