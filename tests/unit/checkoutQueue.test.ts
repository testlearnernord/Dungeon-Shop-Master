import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKOUT_LINE_MAX_CUSTOMERS, checkoutQueueIds, checkoutQueueIndex, checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { createShopLayout, replaceCounterPlacement, shopLayoutProblem } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import type { ShopCart } from "../../src/game/shopCarts.ts";
import { NPC_CENTER_CLEARANCE } from "../../src/game/npcTraffic.ts";
import {cashierServicePoint,turnShopOffset} from "../../src/game/furnitureRegistry.ts";

const cart = (heroId: string): ShopCart => ({
  heroId, day: 1,
  lines: [{ itemId: "bread", slotId: "shelf-1-slot-1", quantity: 1, subtotal: 1 }],
}) as ShopCart;

test("queue uses persistent cart order, not render order", () => {
  const carts = [cart("b"), cart("a"), cart("c")];
  assert.deepEqual(checkoutQueueIds(carts), ["b", "a", "c"]);
  assert.equal(checkoutQueueIndex(carts, "a"), 1);
  assert.equal(checkoutQueueIndex(carts, "missing"), -1);
  const compacted = carts.filter(c => c.heroId !== "b");
  assert.deepEqual(checkoutQueueIds(compacted), ["a", "c"]);
  assert.equal(checkoutQueueIndex(compacted, "a"), 0);
});

test("queue cannot outgrow its first five visible customers",()=>{
  const layout=createShopLayout();
  const points=checkoutQueuePoints(layout,{x:0,z:-1},40);
  assert.equal(points.length,CHECKOUT_LINE_MAX_CUSTOMERS);
  const p=layout.counter!;
  // New-game counter faces the showroom, so single-file customers advance
  // along X while retaining the same Z row.
  assert(points.every(point=>Math.abs(point.z-p.z)<0.01));
  for(let i=1;i<points.length;i++)
    assert(points[i].x>points[i-1].x,
      "next queue position must be behind the preceding customer");
});

test("empty carts never occupy checkout spots", () => {
  const carts = [cart("a"), { ...cart("empty"), lines: [] }, cart("b")];
  assert.deepEqual(checkoutQueueIds(carts), ["a", "b"]);
});

test("one single-file checkout line stays separated; excess demand uses overflow", () => {
  const base = createShopLayout();
  const layout = {
    ...base,
    shelves: base.shelves.map(shelf => shelf.id === "shelf-1"
      ? { ...shelf, x: 0, z: -2, rotation: 1 as const }
      : shelf),
  };
  assert.equal(shopLayoutProblem(layout), null);
  const from = {x:0,z:-1};
  const points = checkoutQueuePoints(layout, from, 100);
  assert.ok(points.length >= 1);
  assert.ok(points.length <= CHECKOUT_LINE_MAX_CUSTOMERS,
    "the physical cashier must never fan customers into parallel rows");
  const front=cashierServicePoint(layout.counter,"customer");
  const axis=turnShopOffset(0,-1,layout.counter.rotation);
  for (const [index, point] of points.entries()) {
    const dx=point.x-front.x,dz=point.z-front.z;
    assert.ok(Math.abs(dx*axis.z-dz*axis.x)<0.01,
      "all cashier customers stand in one rotated single-file lane");
    assert.ok(dx*axis.x+dz*axis.z>=-0.01,
      "queue positions extend away from the register");
    assert.equal(isObstructed(point, layout), false);
    const route = pathToShopGoal(from, point, layout);
    assert.ok(route);
    assert.deepEqual(route.waypoints.at(-1) ?? from, point);
    for (const other of points.slice(0,index))
      assert.ok(Math.hypot(point.x-other.x,point.z-other.z)>=NPC_CENTER_CLEARANCE-1e-6);
  }
  assert.ok(points.length < 100);
});


test("queue allocation rejects invalid capacities without inventing standing spots", () => {
  const layout = createShopLayout();
  const from = {x: 0, z: -1};
  assert.deepEqual(checkoutQueuePoints(layout, from, 0), []);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => checkoutQueuePoints(layout, from, invalid), RangeError);
  }
  assert.equal(checkoutQueuePoints(layout, from, 1).length, 1);
});


test("rotated and relocated checkout offers reachable, separated standing spots",()=>{
  const base=createShopLayout();
  const from={x:0,z:-1};
  for(const rotation of [0,1,2,3] as const){
    const counter=replaceCounterPlacement(base,{x:0,z:0,rotation});
    assert.equal(counter.message,"Counter placement saved.");
    const layout=counter.layout;
    const points=checkoutQueuePoints(layout,from,8);
    assert.ok(points.length>=1,"Must leave at least one checkout slot at rotation "+rotation);
    assert.equal(isObstructed(points[0],layout),false);
    for(const [index,point] of points.entries()){
      const origin=isObstructed(from,layout)
        ? {x: rotation===1?-2.1:rotation===3?2.1:0,
           z: rotation===0?-2.1:rotation===2?2.1:0}
        : from;
      assert.ok(pathToShopGoal(origin,point,layout),"Reachable checkout "+rotation);
      for(const previous of points.slice(0,index))
        assert.ok(Math.hypot(point.x-previous.x,point.z-previous.z)>=NPC_CENTER_CLEARANCE-1e-6);
    }
  }
});

test("checkout navigation blocks rotated countertop and reserves accessible queue",()=>{
  const base=createShopLayout();
  const rotated=replaceCounterPlacement(base,{x:0,z:0,rotation:1});
  assert.equal(rotated.message,"Counter placement saved.");
  assert.equal(isObstructed({x:0,z:-0.95},rotated.layout),true);
  assert.equal(isObstructed({x:0,z:0.95},rotated.layout),true);
  const slots=checkoutQueuePoints(rotated.layout,{x:0,z:-1},3);
  assert.ok(slots.length>0);
  assert.ok(slots.every(point=>!isObstructed(point,rotated.layout)));
  const invalid=replaceCounterPlacement(base,{x:4,z:-5.5,rotation:0});
  assert.strictEqual(invalid.layout,base,"A counter without a usable queue must be rejected");
});

test("a stable physical queue slot does not trigger an outward re-route",async()=>{
  const {checkoutWaitAlreadyAtSlot}=await import(
    "../../src/game/checkoutQueue.ts");
  const standing={x:2,z:1};
  assert.equal(checkoutWaitAlreadyAtSlot("queueing","awaiting-checkout",1,
    standing,{x:2.02,z:1},false),true);
  assert.equal(checkoutWaitAlreadyAtSlot("queueing","awaiting-checkout",0,
    standing,{x:2,z:1.8},false),false,
    "Promoted customers must still walk forward to their new place.");
  assert.equal(checkoutWaitAlreadyAtSlot("queueing","awaiting-checkout",1,
    standing,standing,true),false,
    "Moving furniture must revalidate reachability.");
  assert.equal(checkoutWaitAlreadyAtSlot("leaving","awaiting-checkout",1,
    standing,standing,false),false);
});
