import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {createCellarRoom,cellarChestProblem,cellarTableProblem,isCellarFloor,
  cellarLocalCell} from "../../src/game/cellarRoom.ts";
import {surfaceFromMesh,blueprintAtSurface} from "../../src/game/furnitureBlueprint.ts";

test("cellar is a separate saved cave using the existing mining rules",()=>{
  const initial=createGameState(),store=new GameStore(initial);
  assert.equal(isCellarFloor(initial.cellarRoom,0,-27),true);
  assert.equal(isCellarFloor(initial.cellarRoom,8,-27),false);
  assert.deepEqual(cellarLocalCell(8,-27),{x:8,z:0});
  assert.equal(store.excavateCellarCell({x:9,z:0}),
    "Only exposed rock can be mined.");
  assert.equal(store.excavateCellarCell({x:8,z:0}),
    "Cellar rock excavated.");
  assert.equal(store.state.cellarRoom.excavatedCells[0],"8,0");
  assert.strictEqual(store.state.level5Room,initial.level5Room,
    "Cellar excavation must not mine the public shop.");
  assert.equal(store.state.shopEconomy,initial.shopEconomy);
  assert.equal(store.state.worldClock,initial.worldClock);
  assert.equal(surfaceFromMesh("cellar-floor"),"floor");
  assert.equal(surfaceFromMesh("cellar-excavated-floor-8,0"),"floor");
  assert.equal(surfaceFromMesh("cellar-excavation-rock-face-7.5:0:0.4:1:8:0:false"),
    "rock-wall");
  assert.equal(createCellarRoom().expansionTier,1);
});

test("the portrait opens a real persisted collision gate without changing world time",()=>{
  const store=new GameStore(createGameState());
  const time=store.state.worldClock;
  assert.equal(store.state.cellarDoorOpen,false);
  assert.match(store.toggleCellarDoor(),/staircase/);
  assert.equal(store.state.cellarDoorOpen,true);
  assert.strictEqual(store.state.worldClock,time);
  const loaded=parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(loaded.cellarDoorOpen,true);
  assert.equal(store.toggleCellarDoor(),"Galvik's secret passage is concealed again.");
  assert.equal(store.state.cellarDoorOpen,false);
});

test("cellar furniture reuses the shared blueprint preview and commit",()=>{
  const state=createGameState(),store=new GameStore(state);
  const p=blueprintAtSurface("cellar-chest","floor",{x:3.26,z:-28.01},1);
  assert.deepEqual(p,{id:"cellar-chest",x:3.25,z:-28,rotation:1});
  assert.equal(store.previewFurniturePlacement(p!),null);
  assert.equal(store.placeFurniture(p!),"Cellar chest placed.");
  assert.deepEqual(store.state.cellarChest,p);
  assert.equal(cellarChestProblem(store.state.cellarChest,store.state.cellarRoom),null);
  const rejected={id:"cellar-chest" as const,x:9,z:-27,rotation:0 as const};
  assert.match(store.placeFurniture(rejected),/Excavate floor/);
  assert.deepEqual(store.state.cellarChest,p);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.cellarChest,p);
  assert.deepEqual(saved.cellarRoom,store.state.cellarRoom);
});

test("Galvik's Table starts against the rear wall, moves with P and persists",()=>{
  const initial=createGameState(),store=new GameStore(initial);
  assert.deepEqual(initial.cellarTable,{id:"cellar-table",x:0,z:-33,rotation:0});
  assert.equal(cellarTableProblem(initial.cellarTable,initial.cellarRoom,
    initial.cellarChest),null);
  const moved=blueprintAtSurface("cellar-table","floor",
    {x:1.24,z:-32.04},1)!;
  assert.deepEqual(moved,{id:"cellar-table",x:1.25,z:-32,rotation:1});
  assert.equal(store.previewFurniturePlacement(moved),null);
  assert.equal(store.placeFurniture(moved),"Galvik's Table placed.");
  assert.deepEqual(store.state.cellarTable,moved);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.cellarTable,moved);
  assert.equal(saved.worldClock.tick,initial.worldClock.tick,
    "furniture movement does not advance time");
  const overlapping={id:"cellar-table" as const,x:3,z:-27,rotation:0 as const};
  assert.match(store.previewFurniturePlacement(overlapping)!,/overlap/);
  assert.match(store.placeFurniture(overlapping),/overlap/);
  assert.deepEqual(store.state.cellarTable,moved);
  const chestOverlap={id:"cellar-chest" as const,x:1.25,z:-32,rotation:0 as const};
  assert.match(store.placeFurniture(chestOverlap),/overlap/);
  assert.deepEqual(store.state.cellarChest,initial.cellarChest);
  const unsupported={id:"cellar-table" as const,x:6.75,z:-33,rotation:0 as const};
  assert.match(store.previewFurniturePlacement(unsupported)!,/Excavate floor/);
  const badSave=JSON.parse(JSON.stringify(createSave(store.state)));
  badSave.payload.cellarTable={id:"cellar-table",x:9,z:-33,rotation:0};
  assert.throws(()=>parseSave(JSON.stringify(badSave)),/cellarTable/);
});
