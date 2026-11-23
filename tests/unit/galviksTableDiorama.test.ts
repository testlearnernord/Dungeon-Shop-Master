import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {tableDioramaPosition,TABLE_DIORAMA_WELL}
  from "../../src/game/galviksTableDiorama.ts";

test("physical diorama auto-fits all supported LIVE floor dimensions inside the measured GLB recess",()=>{
  for(const floor of [1,2,4,5,6,7,9,10]){
    const layout=generateExpeditionLayout(7531,floor);
    assert(layout.width===19||layout.width===31);
    assert.equal(layout.width,layout.height);
    const cx=(layout.width-1)/2,cz=(layout.height-1)/2;
    assert.deepEqual(tableDioramaPosition(layout,{x:cx,z:cz}),{x:0,z:0});
    const min=tableDioramaPosition(layout,{x:0,z:0});
    const max=tableDioramaPosition(layout,{
      x:layout.width-1,z:layout.height-1,
    });
    assert(Math.abs(min.x)<=TABLE_DIORAMA_WELL.width/2);
    assert(Math.abs(max.x)<=TABLE_DIORAMA_WELL.width/2);
    assert(Math.abs(min.z)<=TABLE_DIORAMA_WELL.depth/2);
    assert(Math.abs(max.z)<=TABLE_DIORAMA_WELL.depth/2);
    assert.equal(min.x,-max.x);
    assert.equal(min.z,-max.z);
    // No tiny central map: the border reaches within one half-tile of
    // every side, including the wider 31×31 floors.
    const xStep=TABLE_DIORAMA_WELL.width/layout.width;
    const zStep=TABLE_DIORAMA_WELL.depth/layout.height;
    assert(Math.abs(max.x+xStep/2-TABLE_DIORAMA_WELL.width/2)<1e-9);
    assert(Math.abs(max.z+zStep/2-TABLE_DIORAMA_WELL.depth/2)<1e-9);
  }
});

test("diorama walls have real positive relief while remaining within the table rim",()=>{
  assert(TABLE_DIORAMA_WELL.wallHeight>.025);
  assert(TABLE_DIORAMA_WELL.wallY+TABLE_DIORAMA_WELL.wallHeight/2<.89);
  assert(TABLE_DIORAMA_WELL.floorY>TABLE_DIORAMA_WELL.baseY);
});
