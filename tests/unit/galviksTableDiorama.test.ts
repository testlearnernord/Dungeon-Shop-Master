import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {tableDioramaFit,tableDioramaPosition,TABLE_DIORAMA_WELL,
  MAX_DIORAMA_TILE_STRETCH} from "../../src/game/tableDioramaGeometry.ts";

test("adaptive border fit fills the entire GLB recess without warping LIVE floor topology",()=>{
  for(const floor of [1,2,4,5,6,7,9,10]){
    const layout=generateExpeditionLayout(7531,floor);
    assert(layout.width===19||layout.width===31);
    assert.equal(layout.width,layout.height);
    const fit=tableDioramaFit(layout);
    const ratio=Math.max(fit.tileWidth/fit.tileDepth,
      fit.tileDepth/fit.tileWidth);
    assert(ratio<=MAX_DIORAMA_TILE_STRETCH+1e-9);
    assert(fit.coreWidth<=TABLE_DIORAMA_WELL.width+1e-9);
    assert(fit.coreDepth<=TABLE_DIORAMA_WELL.depth+1e-9);
    // Dungeon plus authentic filled banks exactly reach the recess edges.
    assert(Math.abs(fit.coreWidth+2*fit.borderX-
      TABLE_DIORAMA_WELL.width)<1e-9);
    assert(Math.abs(fit.coreDepth+2*fit.borderZ-
      TABLE_DIORAMA_WELL.depth)<1e-9);
    assert(fit.borderX>.04&&fit.borderX<.10,
      "Near-square layout should fill most of the rectangular well");
    assert(fit.borderZ<1e-9,"No unfilled strips along the short dimension");
    const cx=(layout.width-1)/2,cz=(layout.height-1)/2;
    assert.deepEqual(tableDioramaPosition(layout,{x:cx,z:cz}),{x:0,z:0});
    const min=tableDioramaPosition(layout,{x:0,z:0});
    const max=tableDioramaPosition(layout,{
      x:layout.width-1,z:layout.height-1,
    });
    assert.equal(min.x,-max.x);
    assert.equal(min.z,-max.z);
    assert(Math.abs(max.x+fit.tileWidth/2-fit.coreWidth/2)<1e-9);
    assert(Math.abs(max.z+fit.tileDepth/2-fit.coreDepth/2)<1e-9);
    assert(Math.abs(min.x-fit.tileWidth/2+fit.coreWidth/2)<1e-9);
    assert(Math.abs(min.z-fit.tileDepth/2+fit.coreDepth/2)<1e-9);
  }
});

test("adaptive fit also handles non-square layouts without inventing new tiles",()=>{
  for(const layout of [{width:24,height:12},{width:12,height:24},
    {width:15,height:15}]){
    const fit=tableDioramaFit(layout);
    assert(fit.borderX>=0&&fit.borderZ>=0);
    assert(fit.coreWidth>0&&fit.coreDepth>0);
    assert(Math.abs(fit.coreWidth+2*fit.borderX-
      TABLE_DIORAMA_WELL.width)<1e-9);
    assert(Math.abs(fit.coreDepth+2*fit.borderZ-
      TABLE_DIORAMA_WELL.depth)<1e-9);
    const ratio=Math.max(fit.tileWidth/fit.tileDepth,
      fit.tileDepth/fit.tileWidth);
    assert(ratio<=MAX_DIORAMA_TILE_STRETCH+1e-9);
  }
  assert.throws(()=>tableDioramaFit({width:0,height:19}),RangeError);
});

test("diorama walls have real positive relief while remaining within the table rim",()=>{
  assert(TABLE_DIORAMA_WELL.wallHeight>.06);
  assert(TABLE_DIORAMA_WELL.wallY+TABLE_DIORAMA_WELL.wallHeight/2<.99);
  assert(TABLE_DIORAMA_WELL.floorY>TABLE_DIORAMA_WELL.baseY);
});
