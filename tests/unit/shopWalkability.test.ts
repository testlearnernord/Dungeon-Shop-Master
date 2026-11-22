import test from "node:test";
import assert from "node:assert/strict";
import { createShopLayout } from "../../src/game/shopLayout.ts";
import { createShopRoomGeometry, excavateShopRoomCell } from "../../src/game/shopRoomGeometry.ts";
import { shopFloorWalkable, shopFloorSegmentWalkable } from "../../src/game/shopWalkability.ts";

test("walkability shares the mined room and furniture footprint",()=>{
  const layout=createShopLayout();
  const original={...createShopRoomGeometry(),expansionTier:1};
  assert.equal(shopFloorWalkable({x:0,z:0},original,layout),true);
  assert.equal(shopFloorWalkable({x:0,z:2.5},original,layout),true);
  assert.equal(shopFloorWalkable({x:-4.25,z:-4.5},original,layout),false);
  assert.equal(shopFloorWalkable({x:8,z:4},original,layout),false);
  const mined=excavateShopRoomCell(original,{x:8,z:4});
  assert.equal(mined.ok,true);
  if(!mined.ok)return;
  assert.equal(shopFloorWalkable({x:8,z:4},mined.room,layout),true);
  assert.equal(shopFloorWalkable({x:8.3,z:4},mined.room,layout),false);
  assert.equal(shopFloorSegmentWalkable({x:6,z:4},{x:8,z:4},mined.room,layout),true);
  assert.equal(shopFloorSegmentWalkable({x:6,z:4},{x:9,z:4},mined.room,layout),false);
});
