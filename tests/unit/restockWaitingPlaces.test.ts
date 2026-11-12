import assert from "node:assert/strict";
import test from "node:test";
import { checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE } from "../../src/game/npcTraffic.ts";
import { createShopLayout, replaceShelfPlacement, shelfBounds } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import { RESTOCK_WAIT_CLEARANCE, RESTOCK_WAIT_MAX_Z,
  restockWaitingPositions, reserveRestockWaitingRoute } from "../../src/game/restockWaitingPlaces.ts";

test("restock requests occupy reachable rear pockets, never the shelf or entrance aisle",()=>{
  const layout=createShopLayout();
  const positions=restockWaitingPositions(layout);
  assert(positions.length>=6,"standard shop needs several reserved side waiting pockets");
  const queues=checkoutQueuePoints(layout,{x:0,z:-1},12);
  for(const [i,point] of positions.entries()){
    assert(point.z<=RESTOCK_WAIT_MAX_Z,"do not camp at the shelf / entry throat");
    assert(Math.abs(point.x)>=2,"restock pockets must be to the sides of checkout");
    assert(!isObstructed(point,layout));
    const route=pathToShopGoal({x:-3.43,z:4.65},point,layout);
    assert(route,"must be reachable from Level 4");
    assert.deepEqual(route!.waypoints.at(-1),point);
    assert(queues.every(q=>Math.hypot(point.x-q.x,point.z-q.z)>=RESTOCK_WAIT_CLEARANCE));
    for(const previous of positions.slice(0,i))
      assert(Math.hypot(point.x-previous.x,point.z-previous.z)>=
        NPC_CENTER_CLEARANCE,"spots cannot overlap shoulder-to-shoulder");
  }
});

test("three shoppers with the same out-of-stock item get distinct destinations",()=>{
  const layout=createShopLayout();
  const occupied:{x:number;z:number}[]=[];
  const reserved:{x:number;z:number}[]=[];
  for(let hero=0;hero<3;hero++){
    const place=reserveRestockWaitingRoute(layout,{x:-3.43,z:4.65},
      occupied,reserved,hero);
    assert(place,"shoppers cannot form an idle pile outside the Waybread shelf");
    assert(place.point.z<-3.1);
    assert.deepEqual(place.route.waypoints.at(-1),place.point);
    reserved.push(place.point);
  }
  assert.equal(reserved.length,3);
  assert(reserved.every((p,i)=>reserved.slice(0,i).every(other=>
    Math.hypot(p.x-other.x,p.z-other.z)>=RESTOCK_WAIT_CLEARANCE)));
  const fromShelf=reserveRestockWaitingRoute(layout,{x:-5.1,z:0},occupied,
    reserved,3);
  assert(fromShelf,"late shopper should find a distinct off-aisle slot too");
});

test("moving shelves invalidate waiting pockets without allowing overlaps or fake routes",()=>{
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
      assert(Math.hypot(dx,dz)>=1.05);
    }
    assert(pathToShopGoal({x:-3.43,z:4.65},point,moved.layout));
  }
});

test("all allocated pockets occupied never silently routes to current shelf position",()=>{
  const layout=createShopLayout();
  const places=restockWaitingPositions(layout);
  const found=reserveRestockWaitingRoute(layout,{x:-5.0,z:0},[],
    places,0);
  assert.equal(found,null,"callers must retry instead of waiting in a shopping aisle");
});
