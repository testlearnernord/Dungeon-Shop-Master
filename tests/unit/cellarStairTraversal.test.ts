import assert from "node:assert/strict";
import test from "node:test";
import {cellarGravityForPlayer,NORMAL_SHOP_GRAVITY,
 ASCENDING_CELLAR_GRAVITY} from "../../src/game/cellarStairTraversal.ts";

test("real upward motion in open stair corridor receives gentle gravity",()=>{
  for(const z of [-12.4,-16,-19.9])
    assert.equal(cellarGravityForPlayer(-.85,z,0,1,0,true),
      ASCENDING_CELLAR_GRAVITY);
  assert.equal(cellarGravityForPlayer(-.85,-18,Math.PI, -1,0,true),
    ASCENDING_CELLAR_GRAVITY,"Backpedaling upstairs also works");
});
test("descending, idle, closed door and outside stairs keep real gravity",()=>{
  for(const args of [
    [-.85,-16,0,-1,0,true],[-.85,-16,0,0,0,true],
    [-.85,-16,0,1,0,false],[-4,-16,0,1,0,true],
    [-.85,-25,0,1,0,true],[-.85,-10,0,1,0,true],
  ]as const)
    assert.equal(cellarGravityForPlayer(...args),NORMAL_SHOP_GRAVITY);
});
