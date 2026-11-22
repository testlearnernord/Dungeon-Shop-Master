import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,dungeonShortestPath,dungeonDownStair}
  from "../../src/game/dungeonLayout.ts";
import {
  CURSED_SHOP_REALM,FIRST_DUNGEON_FLOOR,LAST_ORDINARY_FLOOR,
  CAVE_TROLL_FLOOR,isOrdinaryDungeonFloor,isNumberedDungeonFloor,
  upwardDestinations,downwardDestination,canAttemptCaveTroll,
  type OrdinaryDungeonFloor,
} from "../../src/game/dungeonTopology.ts";

test("cursed realm has no numbered floor and 1–9 are all real seeded maps",()=>{
  assert.equal(CURSED_SHOP_REALM,"cursed-shop");
  assert.equal(FIRST_DUNGEON_FLOOR,1);
  assert.equal(LAST_ORDINARY_FLOOR,9);
  assert.equal(CAVE_TROLL_FLOOR,10);
  for(let floor=1;floor<=10;floor++){
    assert.equal(isNumberedDungeonFloor(floor),true);
    assert.equal(isOrdinaryDungeonFloor(floor),floor<10);
    const map=generateExpeditionLayout(7351,floor);
    const down=dungeonDownStair(map);
    assert(map.features.some(feature=>feature.kind==="monster"));
    assert(dungeonShortestPath(map,map.entrance,down).length>1,
      "Numeric floor "+floor+" must be connected regardless of story gating");
  }
  for(const value of [0,-1,11,5.5,NaN,Infinity]){
    assert.equal(isOrdinaryDungeonFloor(value),false);
    assert.equal(isNumberedDungeonFloor(value),false);
  }
});

test("every upward choice has the optional cursed threshold without hijacking real stairs",()=>{
  for(let n=1;n<=LAST_ORDINARY_FLOOR;n++){
    const floor=n as OrdinaryDungeonFloor;
    const options=upwardDestinations(floor);
    assert.deepEqual(options.at(-1),{kind:"shop",realm:"cursed-shop"});
    assert.equal(options.length,n===1?1:2);
    if(n>1)assert.deepEqual(options[0],{kind:"floor",floor:n-1});
    assert.deepEqual(downwardDestination(floor),{kind:"floor",floor:n+1});
  }
  assert.deepEqual(downwardDestination(9),{kind:"floor",floor:10});
});

test("Cave Troll party entry must be a real saved group, not a solo permit loophole",()=>{
  assert.equal(canAttemptCaveTroll(1,true),false);
  assert.equal(canAttemptCaveTroll(2,false),false);
  assert.equal(canAttemptCaveTroll(2,true),true);
  assert.equal(canAttemptCaveTroll(3,true),true);
  assert.equal(canAttemptCaveTroll(4,true),false);
});
