import test from "node:test";
import assert from "node:assert/strict";
import { createShopLayout } from "../../src/game/shopLayout.ts";
import { createLevel5Room, excavateLevel5Cell } from "../../src/game/level5Room.ts";
import { pathToShopGoal } from "../../src/game/shopperNavigation.ts";

test("room-aware navigation uses excavated cells without changing legacy routes",()=>{
  const layout=createShopLayout();
  const room={...createLevel5Room(),expansionTier:1};
  const origin={x:6,z:0};
  const destination={x:8,z:0};
  assert.equal(pathToShopGoal(origin,destination,layout,room),null);
  const opened=excavateLevel5Cell(room,{x:8,z:0});
  assert.equal(opened.ok,true);
  if(!opened.ok)return;
  const route=pathToShopGoal(origin,destination,layout,opened.room);
  assert.notEqual(route,null);
  assert.equal(route?.waypoints.at(-1)?.x,8);
  assert.notEqual(pathToShopGoal({x:0,z:0},{x:2,z:0},layout),null);
});
