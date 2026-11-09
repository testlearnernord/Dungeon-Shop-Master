import assert from "node:assert/strict";
import test from "node:test";
import { createShopLayout } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import { gateTravelLane, idleShopPosition, nextEntranceSpawnZ } from "../../src/game/npcTraffic.ts";

test("level 4 and level 6 entrances use distinct inbound and outbound lanes",()=>{
  for(const gate of ["level4","level6"] as const){
    const entering=gateTravelLane(gate,"entering");
    const leaving=gateTravelLane(gate,"leaving");
    const center=gate==="level4"?-4:4;
    assert(Math.abs(entering-leaving)>0.54);
    assert(Math.abs(entering-center)<0.8);
    assert(Math.abs(leaving-center)<0.8);
  }
});

test("burst arrivals get non-overlapping spawns, without crossing the corridor walls",()=>{
  const x=gateTravelLane("level4","entering");
  const occupied:{x:number;z:number}[]=[];
  for(let i=0;i<24;i++){
    const z=nextEntranceSpawnZ(x,occupied);
    for(const person of occupied)
      assert(Math.hypot(person.x-x,person.z-z)>=0.7);
    occupied.push({x,z});
  }
  assert.equal(occupied[0].z,13);
  assert(occupied[23].z>occupied[0].z);
});

test("idle guests have distinct walkable standing positions away from both gate approaches",()=>{
  const layout=createShopLayout();
  const spots=Array.from({length:36},(_,slot)=>idleShopPosition(slot));
  for(let i=0;i<spots.length;i++){
    const point=spots[i];
    assert(point.z<0,"idle NPCs must not block the doorway");
    assert(!isObstructed(point,layout));
    for(let j=0;j<i;j++)assert(Math.hypot(point.x-spots[j].x,point.z-spots[j].z)>0.8);
    const route=pathToShopGoal({x:gateTravelLane("level4","entering"),z:6},point,layout);
    assert(route,"idle location should be reachable from the level 4 entrance");
  }
});
