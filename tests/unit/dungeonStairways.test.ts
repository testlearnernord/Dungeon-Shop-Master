import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,dungeonDownStair,dungeonShortestPath}
  from "../../src/game/dungeonLayout.ts";
import {dungeonFloorStairways} from "../../src/game/dungeonStairways.ts";

test("every physical floor shows exact entrance, and only real traversable descents",()=>{
  for(const floor of [1,2,3,4,5,6,7,8,9]){
    const layout=generateExpeditionLayout(7351,floor);
    const stairs=dungeonFloorStairways(layout);
    assert.equal(stairs.length,2);
    assert.deepEqual({x:stairs[0].x,z:stairs[0].z},layout.entrance);
    assert.equal(stairs[0].kind,floor===1?"exit":"ascend");
    assert.equal(stairs[0].destinationFloor,floor>1?floor-1:null);
    assert.deepEqual({x:stairs[1].x,z:stairs[1].z},
      dungeonDownStair(layout));
    assert.ok(dungeonShortestPath(layout,layout.entrance,stairs[1]).length>1);
    assert.equal(stairs[1].kind,"descend");
    assert.equal(stairs[1].destinationFloor,floor+1);
    assert.match(stairs[1].label,/DESCEND/);
    if(floor===9)assert.match(stairs[1].label,/CAVE TROLL.*PARTY ONLY/);
    assert.deepEqual(dungeonFloorStairways(layout),stairs,"No new RNG/site generation");
    assert.equal(layout.features.some(feature=>stairs.some(stair=>
      stair.id===feature.id)),false,"Stairs cannot be resolved as loot sites");
  }
  const boss=dungeonFloorStairways(generateExpeditionLayout(7351,10));
  assert.equal(boss.length,1,"Floor 10 is a boss destination, not an ordinary downward route");
  assert.equal(boss[0].kind,"ascend");
  assert.equal(boss[0].destinationFloor,9);
});
