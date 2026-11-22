import assert from "node:assert/strict";
import test from "node:test";
import {caveSurfaceUV,CAVE_SURFACE_METRES_PER_REPEAT}
  from "../../src/game/caveSurfaceProjection.ts";

test("mined one-metre floor tiles share world-aligned UVs with original shop floor",()=>{
  const up={x:0,y:1,z:0};
  assert.equal(CAVE_SURFACE_METRES_PER_REPEAT,2);
  assert.deepEqual(caveSurfaceUV({x:7.5,y:0,z:0},up),{u:3.75,v:0});
  assert.deepEqual(caveSurfaceUV({x:7.5,y:0,z:0},up),
    caveSurfaceUV({x:8-.5,y:0,z:0},up),
    "UVs at the old wall and first mined-cell boundary must be identical");
  assert.equal(caveSurfaceUV({x:8.5,y:0,z:0},up).u,4.25);
  assert.equal(caveSurfaceUV({x:8.5,y:0,z:1},up).v,0.5);
});
test("all unrotated stone faces use the same two-metre scale across mined boundaries",()=>{
  const wallX={x:1,y:0,z:0},wallZ={x:0,y:0,z:1};
  assert.deepEqual(caveSurfaceUV({x:7.5,y:2,z:0},wallX),{u:0,v:1});
  assert.deepEqual(caveSurfaceUV({x:9.5,y:2,z:0},wallX),{u:0,v:1});
  assert.deepEqual(caveSurfaceUV({x:8,y:2,z:1.5},wallZ),{u:4,v:1});
  assert.deepEqual(caveSurfaceUV({x:8,y:2,z:2.5},wallZ),{u:4,v:1});
  assert.deepEqual(caveSurfaceUV({x:8,y:0,z:0},{x:0,y:-1,z:0}),
    {u:4,v:0});
});
test("shop and cellar offsets do not restart surface UVs per carved cell",()=>{
  const normal={x:0,y:1,z:0};
  const base=caveSurfaceUV({x:8,y:0,z:0},normal);
  const cellar=caveSurfaceUV({x:8,y:-5,z:-30},normal);
  assert.equal(base.u,cellar.u);
  assert.equal(base.v-cellar.v,15);
});
