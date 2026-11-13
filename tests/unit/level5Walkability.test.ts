import test from "node:test";
import assert from "node:assert/strict";
import { createShopLayout } from "../../src/game/shopLayout.ts";
import { createLevel5Room, excavateLevel5Cell } from "../../src/game/level5Room.ts";
import { level5FloorWalkable, level5FloorSegmentWalkable } from "../../src/game/level5Walkability.ts";

test("walkability shares the mined room and furniture footprint",()=>{
  const layout=createShopLayout();
  const original={...createLevel5Room(),expansionTier:1};
  assert.equal(level5FloorWalkable({x:0,z:0},original,layout),true);
  assert.equal(level5FloorWalkable({x:0,z:2.5},original,layout),false);
  assert.equal(level5FloorWalkable({x:8,z:0},original,layout),false);
  const mined=excavateLevel5Cell(original,{x:8,z:0});
  assert.equal(mined.ok,true);
  if(!mined.ok)return;
  assert.equal(level5FloorWalkable({x:8,z:0},mined.room,layout),true);
  assert.equal(level5FloorWalkable({x:8.3,z:0},mined.room,layout),false);
  assert.equal(level5FloorSegmentWalkable({x:6,z:0},{x:8,z:0},mined.room,layout),true);
  assert.equal(level5FloorSegmentWalkable({x:6,z:0},{x:9,z:0},mined.room,layout),false);
});
