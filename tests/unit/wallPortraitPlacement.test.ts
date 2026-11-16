import assert from "node:assert/strict";
import test from "node:test";
import {GameStore} from "../../src/game/gameStore.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {createLevel5Room,excavateLevel5Cell} from "../../src/game/level5Room.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {wallPortraitAtWall,wallPortraitProblem} from "../../src/game/wallPortraitPlacement.ts";
import {blueprintAtSurface} from "../../src/game/furnitureBlueprint.ts";
import {furnitureDefinition} from "../../src/game/furnitureRegistry.ts";

test("a one-of-a-kind wall portrait can be hung on real standard walls, but not on doors or floors",()=>{
  const state=createGameState(),store=new GameStore(state);
  assert.equal(furnitureDefinition("galvik-portrait").mount,"shop-wall");
  assert.equal(blueprintAtSurface("galvik-portrait","floor",{x:4,z:0},0),null);
  assert.equal(blueprintAtSurface("galvik-portrait","ceiling",{x:4,z:0},0),null);
  assert.equal(wallPortraitAtWall("front-wall",{x:4.1,z:-7})?.z,-6.45);
  const front={id:"galvik-portrait" as const,x:4,z:-6.45,rotation:2 as const};
  assert.equal(store.previewFurniturePlacement(front),null);
  assert.equal(store.placeFurniture(front),"Portrait hung.");
  assert.deepEqual(store.state.wallPortrait,{x:4,z:-6.45,rotation:2});
  assert.equal(store.placeFurniture({id:"galvik-portrait",x:0,z:-6.45,rotation:2}),
    "Hang the portrait on an existing solid shop wall, not a doorway or empty air.");
  assert.deepEqual(store.state.wallPortrait,{x:4,z:-6.45,rotation:2});
  assert.equal(store.placeFurniture({id:"galvik-portrait",x:0,z:6.45,rotation:0}),
    "Portrait hung.");
  assert.deepEqual(store.state.wallPortrait,{x:0,z:6.45,rotation:0});
  assert.equal(store.placeFurniture({id:"galvik-portrait",x:7.22,z:2,rotation:1}),
    "Portrait hung.","wall-normal offsets should not need a .25m grid");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).wallPortrait,
    store.state.wallPortrait);
});

test("portrait blocks overlap with the board, and malformed saved poses are rejected",()=>{
  const state=createGameState(),store=new GameStore(state);
  const blocked={id:"galvik-portrait" as const,x:-5.25,z:-6.45,rotation:2 as const};
  assert.match(store.previewFurniturePlacement(blocked)??"",/overlaps/);
  assert.equal(store.placeFurniture(blocked),store.previewFurniturePlacement(blocked));
  assert.strictEqual(store.state,state);
  const good={id:"galvik-portrait" as const,x:4,z:-6.45,rotation:2 as const};
  assert.equal(store.placeFurniture(good),"Portrait hung.");
  const save=createSave(store.state),tampered=structuredClone(save);
  tampered.payload.wallPortrait={x:3,z:0,rotation:1};
  assert.throws(()=>parseSave(JSON.stringify(tampered)),/payload.wallPortrait/);
  assert.deepEqual(parseSave(JSON.stringify(save)).wallPortrait,store.state.wallPortrait);
});

test("a real excavated rock wall supports a portrait, and removing it requires relocating the picture",()=>{
  let room={...createLevel5Room(),expansionTier:2};
  for(let x=8;x<=9;x++){
    const dug=excavateLevel5Cell(room,{x,z:0});
    assert(dug.ok);room=dug.room;
  }
  const state=createGameState(),store=new GameStore({...state,level5Room:room});
  const placed=wallPortraitAtWall("rock-wall",{x:9.45,z:0},room);
  assert.deepEqual(placed,{x:9.25,z:0,rotation:1});
  assert.equal(wallPortraitProblem(placed!,store.state.shopLayout,room),null);
  assert.deepEqual(blueprintAtSurface("galvik-portrait","rock-wall",
    {x:9.45,z:0},0,room),{id:"galvik-portrait",...placed});
  assert.equal(store.placeFurniture({id:"galvik-portrait",...placed!}),"Portrait hung.");
  const before=store.state;
  assert.equal(store.excavateShopCell({x:10,z:0}),
    "Move Galvik's portrait before mining its supporting rock.");
  assert.strictEqual(store.state,before);
  assert.equal(store.placeFurniture({
    id:"galvik-portrait",x:4,z:-6.45,rotation:2,
  }),"Portrait hung.");
  assert.equal(store.excavateShopCell({x:10,z:0}),"Rock excavated.");
  const loaded=parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(loaded.wallPortrait?.z,-6.45);
  assert(loaded.level5Room?.excavatedCells.includes("10,0"));
});
