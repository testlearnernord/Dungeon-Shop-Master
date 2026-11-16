import assert from "node:assert/strict";
import test from "node:test";
import { checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE } from "../../src/game/npcTraffic.ts";
import { createShopLayout, replaceShelfPlacement, shelfBounds } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import { RESTOCK_WAIT_CLEARANCE,
  restockWaitingPositions } from "../../src/game/restockWaitingPlaces.ts";

const entrances=[{x:-3.43,z:4.65},{x:4.57,z:4.65}] as const;

test("request stations are generated from current reachable shop topology",()=>{
  const layout=createShopLayout();
  const positions=restockWaitingPositions(layout);
  assert(positions.length>=2,"shop needs at least two independent petition pockets");
  const queues=checkoutQueuePoints(layout,{x:0,z:-1},12);
  for(const [i,point] of positions.entries()){
    assert(!isObstructed(point,layout));
    assert(queues.every(q=>Math.hypot(point.x-q.x,point.z-q.z)>=1.8));
    for(const origin of entrances){
      const route=pathToShopGoal(origin,point,layout);
      assert(route,"request pocket must be reachable from both entrances");
      assert(Math.hypot((route!.waypoints.at(-1)??origin).x-point.x,
        (route!.waypoints.at(-1)??origin).z-point.z)<=0.17);
    }
    for(const previous of positions.slice(0,i))
      assert(Math.hypot(point.x-previous.x,point.z-previous.z)>=
        Math.max(NPC_CENTER_CLEARANCE,RESTOCK_WAIT_CLEARANCE));
  }
});

test("moving shelves regenerates request stations without fixed cave pockets",()=>{
  const original=createShopLayout();
  const moved=replaceShelfPlacement(original,{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(moved.message,"Shelf placement saved.");
  const spots=restockWaitingPositions(moved.layout);
  assert(spots.length>=2);
  for(const point of spots){
    assert(!isObstructed(point,moved.layout));
    for(const shelf of moved.layout.shelves){
      const b=shelfBounds(shelf);
      const dx=Math.max(b.minX-point.x,0,point.x-b.maxX);
      const dz=Math.max(b.minZ-point.z,0,point.z-b.maxZ);
      assert(Math.hypot(dx,dz)>=1.35);
    }
    for(const origin of entrances)assert(pathToShopGoal(origin,point,moved.layout));
  }
});
