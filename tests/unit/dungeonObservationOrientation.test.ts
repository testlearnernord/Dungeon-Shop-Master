import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {tableDioramaPosition} from "../../src/game/tableDioramaGeometry.ts";
import {
  DUNGEON_NORTH_AXIS,DUNGEON_NORTH_YAW,DUNGEON_DEFAULT_PITCH,
  DUNGEON_DEFAULT_DISTANCE,DUNGEON_WORLD_TILE_SIZE,
  TABLE_OBSERVATION_LOCAL_YAW,
  dungeonTileWorldCenter,dungeonTileMinimapPixel,
  dungeonTileFromMinimapUV,orientNorthUpMinimap,
} from "../../src/game/dungeonObservationOrientation.ts";

const rotateY=(p:{x:number;z:number},angle:number)=>({
  x:p.x*Math.cos(angle)+p.z*Math.sin(angle),
  z:-p.x*Math.sin(angle)+p.z*Math.cos(angle),
});
const approx=(a:number,b:number)=>assert(Math.abs(a-b)<1e-9);

test("canonical north and the LIVE spectator default are unambiguous",()=>{
  assert.equal(DUNGEON_NORTH_AXIS,"+Z");
  assert.equal(DUNGEON_NORTH_YAW,0);
  assert.equal(DUNGEON_DEFAULT_PITCH,1.2);
  assert.equal(DUNGEON_DEFAULT_DISTANCE,70);
  assert.deepEqual(dungeonTileWorldCenter({width:31,height:31},{x:15,z:15}),
    {x:0,z:0});
  assert.equal(dungeonTileWorldCenter({width:31,height:31},
    {x:16,z:15}).x,DUNGEON_WORLD_TILE_SIZE);
  assert.equal(dungeonTileWorldCenter({width:31,height:31},
    {x:15,z:16}).z,DUNGEON_WORLD_TILE_SIZE);
});

test("asymmetric landmarks roundtrip from north-up pixels to grid on floors 1/6",()=>{
  for(const floor of [1,6]){
    const layout=generateExpeditionLayout(7531,floor);
    const marks=[{x:1,z:2},{x:3,z:layout.height-4},
      {x:layout.width-4,z:5},
      {x:layout.width-2,z:layout.height-3}];
    for(const mark of marks){
      const pixel=dungeonTileMinimapPixel(mark,layout.height,6);
      assert.equal(pixel.x,mark.x*6);
      assert.equal(pixel.y,(layout.height-1-mark.z)*6);
      const decoded=dungeonTileFromMinimapUV(
        (pixel.x+3)/(layout.width*6),(pixel.y+3)/(layout.height*6),
        layout.width,layout.height);
      assert.deepEqual(decoded,mark);
      assert.equal(pixel.y-dungeonTileMinimapPixel(
        {x:mark.x,z:mark.z+1},layout.height,6).y,6);
    }
    assert.deepEqual(dungeonTileFromMinimapUV(0,0,layout.width,layout.height),
      {x:0,z:layout.height-1});
    assert.equal(dungeonTileFromMinimapUV(1,0,layout.width,layout.height),null);
    assert.equal(dungeonTileFromMinimapUV(-.01,0,layout.width,layout.height),null);
  }
  const matrix:number[]=[];
  orientNorthUpMinimap({setTransform:(...args:number[])=>{
    matrix.push(...args);
  }},186);
  assert.deepEqual(matrix,[1,0,0,-1,0,186]);
});

test("all four table rotations preserve the north/east screen axes for each floor",()=>{
  assert.equal(TABLE_OBSERVATION_LOCAL_YAW,Math.PI);
  for(const floor of [1,6]){
    const layout=generateExpeditionLayout(7531,floor);
    const cx=(layout.width-1)/2,cz=(layout.height-1)/2;
    for(const furnitureQuarter of [0,1,2,3]){
      const furnitureYaw=furnitureQuarter*Math.PI/2;
      for(const point of [{x:cx,z:cz},{x:cx+3,z:cz+1},
        {x:cx-2,z:cz+4}]){
        const logical=dungeonTileWorldCenter(layout,point);
        const art=tableDioramaPosition(layout,point);
        // Babylon uses furniture yaw on the parent, pi on the child root.
        const world=rotateY(rotateY(art,TABLE_OBSERVATION_LOCAL_YAW),
          furnitureYaw);
        const frontView=rotateY(world,-furnitureYaw);
        // Looking from furniture +Z: right = -local X, up = -local Z.
        approx(-frontView.x,art.x);
        approx(-frontView.z,art.z);
        assert.equal(Math.sign(art.x),Math.sign(logical.x));
        assert.equal(Math.sign(art.z),Math.sign(logical.z));
      }
    }
  }
});
