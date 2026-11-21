import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,dungeonDownStair,dungeonShortestPath}
  from "../../src/game/dungeonLayout.ts";
import {dungeonFloorStairways} from "../../src/game/dungeonStairways.ts";

test("every physical floor shows exact entrance, and only real traversable descents",()=>{
  for(const floor of [1,2,3,4,7]){
    const layout=generateExpeditionLayout(7351,floor);
    const stairs=dungeonFloorStairways(layout);
    assert.equal(stairs.length,2);
    assert.deepEqual({x:stairs[0].x,z:stairs[0].z},layout.entrance);
    assert.equal(stairs[0].kind,floor===1||floor===7?"exit":"ascend");
    assert.equal(stairs[0].destinationFloor,floor>1&&floor<7?floor-1:null);
    assert.deepEqual({x:stairs[1].x,z:stairs[1].z},
      dungeonDownStair(layout));
    assert.ok(dungeonShortestPath(layout,layout.entrance,stairs[1]).length>1);
    assert.equal(stairs[1].kind,floor<=3?"descend":"sealed");
    assert.equal(stairs[1].destinationFloor,floor<=3?floor+1:null);
    assert.match(stairs[1].label,floor<=3?/DESCEND/:/SEALED/);
    assert.deepEqual(dungeonFloorStairways(layout),stairs,"No new RNG/site generation");
    assert.equal(layout.features.some(feature=>stairs.some(stair=>
      stair.id===feature.id)),false,"Stairs cannot be resolved as loot sites");
  }
});
