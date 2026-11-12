import assert from "node:assert/strict";
import test from "node:test";
import { createShopLayout, replaceShelfPlacement } from "../../src/game/shopLayout.ts";
import { reserveShelfWaitingRoute } from "../../src/game/shelfWaitingPlaces.ts";
import { isObstructed, shopSegmentClear } from "../../src/game/shopperNavigation.ts";

test("busy shelf waits nearby instead of travelling to the rear-wall restock area",()=>{
  const layout=createShopLayout();
  const origin={x:-4.0,z:4.5};
  const shelf={x:-5.25,z:0};
  const reserved=reserveShelfWaitingRoute(layout,origin,shelf,[],[]);
  assert(reserved,"should find a reachable local staging pocket");
  const end=reserved.point;
  assert.equal(isObstructed(end,layout),false);
  assert(Math.hypot(end.x-shelf.x,end.z-shelf.z)<3.8,
    "ordinary queued shoppers must remain near their shelf");
  assert(end.z>-3.1,"should not travel to the stockout waiting wall");
  let previous=origin;
  for(const point of reserved.route.waypoints){
    assert(shopSegmentClear(previous,point,layout));
    previous=point;
  }
});

test("staging positions respect occupied and reserved destinations",()=>{
  const layout=createShopLayout();
  const from={x:-4,z:4.5};
  const goal={x:-5.25,z:0};
  const first=reserveShelfWaitingRoute(layout,from,goal,[],[]);
  assert(first);
  const second=reserveShelfWaitingRoute(layout,from,goal,[],[first.point]);
  assert(second);
  assert(Math.hypot(second.point.x-first.point.x,second.point.z-first.point.z)>1.17);
});

test("staging uses current moved shelf geometry rather than fixed slot positions",()=>{
  const initial=createShopLayout();
  const placed=replaceShelfPlacement(initial,{
    id:"shelf-1",x:-7,z:-0.25,rotation:0,
  });
  assert.notEqual(placed.layout,initial);
  const staged=reserveShelfWaitingRoute(placed.layout,
    {x:-3.4,z:3},{x:-5.25,z:-0.25},[],[]);
  assert(staged);
  assert.equal(isObstructed(staged.point,placed.layout),false);
});