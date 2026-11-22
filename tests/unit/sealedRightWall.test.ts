import assert from "node:assert/strict";
import test from "node:test";
import {blueprintAtSurface,surfaceFromMesh}
  from "../../src/game/furnitureBlueprint.ts";
import {wallPortraitAtWall} from "../../src/game/wallPortraitPlacement.ts";
import {isSealedPassageWallHit,overlapsShopPortalClearance}
  from "../../src/game/shopPortal.ts";
import {createShopRoomGeometry,isProtectedRoomCell,excavateShopRoomCell}
  from "../../src/game/shopRoomGeometry.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";

test("sealed right exit is rock, not a second editable back-wall or mining target",()=>{
  for(const x of [2.4,2.75,3,4,5,5.25,5.6]){
    assert.equal(isSealedPassageWallHit({x,z:6.8}),true);
    assert.equal(blueprintAtSurface("shelf-1","back-wall",{x,z:6.8},1),null);
    assert.equal(wallPortraitAtWall("back-wall",{x,z:6.8}),null);
  }
  assert.equal(surfaceFromMesh("sealed-right-passage-stone"),null);
  assert.equal(surfaceFromMesh("back-right-wall"),null);
  assert.equal(surfaceFromMesh("back-middle-wall"),"back-wall");
  assert.equal(isProtectedRoomCell({x:4,z:7}),true);
  const room={...createShopRoomGeometry(),expansionTier:3};
  const mine=excavateShopRoomCell(room,{x:4,z:7});
  assert.equal(mine.ok,false);
  assert.equal(room.excavatedCells.length,0);
});

test("wide wall shelves cannot visually bridge a forbidden sealed passage",()=>{
  for(const x of [1.75,2.25,2.5,5.5,5.75,6]){
    assert.equal(blueprintAtSurface("shelf-1","back-wall",{x,z:7},0),null,
      "No shelf ghost at or across sealed back wall, x="+x);
  }
  assert.deepEqual(blueprintAtSurface("shelf-1","back-wall",{x:0,z:7},0),
    {id:"shelf-1",x:0,z:6.75,rotation:1});
  assert.equal(isSealedPassageWallHit({x:0,z:7}),false);
  assert.equal(overlapsShopPortalClearance({
    minX:3,maxX:4,minZ:6.5,maxZ:7}),true);
});

test("cannot commit a shelf at the wall seal even with an arbitrary hand-built draft",()=>{
  const store=new GameStore(createGameState(7351));
  const before=structuredClone(store.state);
  const draft={id:"shelf-1" as const,x:4,z:6.75,rotation:1 as const};
  const reason=store.previewFurniturePlacement(draft);
  assert(reason);
  assert.equal(store.placeFurniture(draft),reason);
  assert.deepEqual(store.state,before);
});
