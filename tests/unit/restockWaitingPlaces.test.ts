import assert from "node:assert/strict";
import test from "node:test";
import { checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE } from "../../src/game/npcTraffic.ts";
import { createShopLayout, replaceShelfPlacement, shelfBounds } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import {shopPortalServicePoint} from "../../src/game/shopPortal.ts";
import { RESTOCK_WAIT_CLEARANCE, isQuietPetitionArea,
  restockWaitingPositions } from "../../src/game/restockWaitingPlaces.ts";

const entry=shopPortalServicePoint("entering");
const exit=shopPortalServicePoint("leaving");

test("request stations are generated from current reachable shop topology",()=>{
  const layout=createShopLayout();
  const positions=restockWaitingPositions(layout);
  assert(positions.length>=2,"shop needs at least two independent petition pockets");
  const queues=checkoutQueuePoints(layout,{x:0,z:-1},12);
  for(const [i,point] of positions.entries()){
    assert(!isObstructed(point,layout));
    assert(isQuietPetitionArea(point),
      "petitioners must not wait in entrance approaches or central lanes");
    assert(queues.every(q=>Math.hypot(point.x-q.x,point.z-q.z)>=1.8));
    const arrival=pathToShopGoal(entry,point,layout);
    const departure=pathToShopGoal(point,exit,layout);
    assert(arrival&&departure,"petition station must connect to the one portal in both directions");
    assert(Math.hypot((arrival.waypoints.at(-1)??entry).x-point.x,
      (arrival.waypoints.at(-1)??entry).z-point.z)<=0.17);
    assert(Math.hypot((departure.waypoints.at(-1)??point).x-exit.x,
      (departure.waypoints.at(-1)??point).z-exit.z)<=0.17);
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
    assert(pathToShopGoal(entry,point,moved.layout));
    assert(pathToShopGoal(point,exit,moved.layout));
  }
});

test("petitions may use side wings, but never the busy entrance or central aisle",()=>{
  assert.equal(isQuietPetitionArea({x:-4,z:4.65}),false);
  assert.equal(isQuietPetitionArea({x:4,z:3}),false);
  assert.equal(isQuietPetitionArea({x:0,z:0}),false);
  assert.equal(isQuietPetitionArea({x:0,z:-4}),false);
  assert.equal(isQuietPetitionArea({x:8,z:0}),true,
    "expanded shop wings must stay eligible for requests");
  assert.equal(isQuietPetitionArea({x:2.5,z:-4}),true);
  const spots=restockWaitingPositions(createShopLayout());
  assert(spots.length>=2);
  assert(spots.every(isQuietPetitionArea));
});
