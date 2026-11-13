import assert from "node:assert/strict";
import test from "node:test";
import { furnitureFacing } from "../../src/game/furnitureFacing.ts";
import { classifyFurnitureMesh } from "../../src/game/furnitureSelection.ts";
import { createShopLayout,replaceCounterPlacement,replaceShelfPlacement } from "../../src/game/shopLayout.ts";
import { checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { shopServiceReachabilityProblem } from "../../src/game/shopServiceReachability.ts";

test("shelf and register customer-facing arrows rotate by visible quarter turns",()=>{
  assert.deepEqual([0,1,2,3].map(rotation=>
    furnitureFacing("shelf-1",rotation as 0|1|2|3).label),
    ["east","north","west","south"]);
  assert.deepEqual([0,1,2,3].map(rotation=>
    furnitureFacing("counter",rotation as 0|1|2|3).label),
    ["north","west","south","east"]);
});

test("P raycast catalog recognizes real shelf/checkout/bedroom furniture",()=>{
  assert.equal(classifyFurnitureMesh("shelf-1-slot-2")?.movableId,"shelf-1");
  assert.equal(classifyFurnitureMesh("shelf-2-back")?.movableId,"shelf-2");
  assert.equal(classifyFurnitureMesh("cash-register")?.movableId,"counter");
  assert.equal(classifyFurnitureMesh("bedroom-account-book")?.id,"debt-book");
  assert.equal(classifyFurnitureMesh("bed-candle-holder")?.id,"candle");
  assert.equal(classifyFurnitureMesh("adventurer-roster-board")?.id,"adventurer-board");
  assert.equal(classifyFurnitureMesh("npc-adventurer-1"),null);
  assert.equal(classifyFurnitureMesh("stone-floor"),null);
});

test("moved cashier places waiting customers in an ordered lane rather than all abreast",()=>{
  const original=createShopLayout();
  const moved=replaceCounterPlacement(original,{x:0,z:0,rotation:1});
  assert.equal(moved.message,"Counter placement saved.");
  const queue=checkoutQueuePoints(moved.layout,{x:0,z:-1},6);
  assert(queue.length>=3);
  const first=queue[0],second=queue[1],third=queue[2];
  // Queue direction follows the counter's local axis.
  assert(Math.hypot(second.x-first.x,second.z-first.z)>=1.02);
  assert(Math.hypot(third.x-first.x,third.z-first.z)>=1.02);
  assert.equal(shopServiceReachabilityProblem(moved.layout),null);
});

test("service routes stay reachable for default and supported moved shelves",()=>{
  assert.equal(shopServiceReachabilityProblem(createShopLayout()),null);
  const moved=replaceShelfPlacement(createShopLayout(),{
    id:"shelf-1",x:-7,z:-0.25,rotation:0,
  });
  assert.equal(moved.message,"Shelf placement saved.");
  assert.equal(shopServiceReachabilityProblem(moved.layout),null);
  const stranded={
    ...createShopLayout(),
    counter:{x:7,z:7,rotation:0 as const},
  };
  assert.match(shopServiceReachabilityProblem(stranded)??"",/checkout|Entrance|wall/i);
});
