import assert from "node:assert/strict";
import test from "node:test";
import { blueprintAtSurface,FURNITURE_CATALOG,surfaceFromMesh,snapQuarter } from "../../src/game/furnitureBlueprint.ts";
import { createShopLayout,replaceCounterPlacement,replaceShelfPlacement } from "../../src/game/shopLayout.ts";

test("raycast mount surfaces identify structural room pieces only",()=>{
  assert.equal(surfaceFromMesh("stone-floor"),"floor");
  assert.equal(surfaceFromMesh("bedroom-floor-skin"),"floor");
  assert.equal(surfaceFromMesh("excavated-floor-8,0"),"floor");
  assert.equal(surfaceFromMesh("excavated-floor--9,-2"),"floor");
  assert.equal(surfaceFromMesh("excavation-rock-face-6"),null);
  assert.equal(surfaceFromMesh("stone-ceiling"),"ceiling");
  assert.equal(surfaceFromMesh("right-wall"),"right-wall");
  assert.equal(surfaceFromMesh("front-left-wall"),"front-wall");
  assert.equal(surfaceFromMesh("corridor-wall--5.3"),null);
  assert.equal(surfaceFromMesh("shelf-1-plank"),null);
  assert.deepEqual(FURNITURE_CATALOG.map(item=>item.id),
    ["shelf-1","shelf-2","counter","desk","chest","candle","bed","adventurer-board"]);
});

test("mouse floor projection snaps to quarter-metre grid with retained rotation",()=>{
  assert.equal(snapQuarter(1.17),1.25);
  const point=blueprintAtSurface("counter","floor",{x:1.13,z:-1.13},3);
  assert.deepEqual(point,{id:"counter",x:1.25,z:-1.25,rotation:3});
  assert.equal(blueprintAtSurface("counter","right-wall",{x:7.5,z:0},0),null);
  assert.equal(blueprintAtSurface("counter","ceiling",{x:0,z:0},0),null);
  assert.equal(blueprintAtSurface("counter","floor",{x:NaN,z:0},0),null);
});

test("wall-surface blueprints face into Galvik's store and preserve shelf IDs",()=>{
  assert.deepEqual(blueprintAtSurface("shelf-1","left-wall",{x:-7.5,z:0.01},2),
    {id:"shelf-1",x:-7,z:0,rotation:0});
  assert.deepEqual(blueprintAtSurface("shelf-2","right-wall",{x:7.5,z:0.05},0),
    {id:"shelf-2",x:7,z:0,rotation:2});
  assert.deepEqual(blueprintAtSurface("shelf-1","front-wall",{x:-5,z:-7},0),
    {id:"shelf-1",x:-5,z:-6.75,rotation:3});
  assert.deepEqual(blueprintAtSurface("shelf-2","back-wall",{x:4,z:7},0),
    {id:"shelf-2",x:4,z:6.75,rotation:1});
  assert.equal(blueprintAtSurface("shelf-1","ceiling",{x:0,z:0},0),null);
  const layout=createShopLayout();
  const left=blueprintAtSurface("shelf-1","left-wall",{x:-7.5,z:0.01},2)!;
  const right=blueprintAtSurface("shelf-2","right-wall",{x:7.5,z:0},0)!;
  assert.equal(replaceShelfPlacement(layout,left).message,"Shelf placement saved.");
  assert.equal(replaceShelfPlacement(layout,right).message,"Shelf placement saved.");
  const movable=blueprintAtSurface("counter","floor",{x:0,z:2.49},0)!;
  assert.equal(replaceCounterPlacement(layout,movable).message,"Counter placement saved.");
});

test("bedroom furniture shares floor snapping but cannot mount to walls or the ceiling",()=>{
  const chest=blueprintAtSurface("chest","floor",{x:-2.24,z:-10.27},1);
  assert.deepEqual(chest,{id:"chest",x:-2.25,z:-10.25,rotation:1});
  assert.equal(blueprintAtSurface("desk","left-wall",{x:-3,z:-9},0),null);
  assert.equal(blueprintAtSurface("candle","ceiling",{x:2,z:-11},0),null);
});

test("movable bed snaps to the room floor; roster board only mounts to real shop walls",()=>{
  assert.deepEqual(blueprintAtSurface("bed","floor",{x:0.72,z:-10.07},1),
    {id:"bed",x:0.75,z:-10,rotation:1});
  assert.equal(blueprintAtSurface("bed","left-wall",{x:-7,z:0},1),null);
  assert.equal(blueprintAtSurface("adventurer-board","floor",{x:-5.5,z:-6.5},0),null);
  assert.deepEqual(blueprintAtSurface("adventurer-board","front-wall",
    {x:5.57,z:-7},0),{id:"adventurer-board",x:5.5,z:-6.45,rotation:2});
  assert.deepEqual(blueprintAtSurface("adventurer-board","right-wall",
    {x:7.5,z:4.46},2),{id:"adventurer-board",x:7.22,z:4.5,rotation:1});
  assert.equal(blueprintAtSurface("adventurer-board","back-wall",
    {x:0,z:7},0),null);
});
