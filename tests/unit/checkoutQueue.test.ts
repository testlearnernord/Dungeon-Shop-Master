import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutQueueIds, checkoutQueueIndex, checkoutQueuePoint, checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { CHECKOUT_COUNTER, createShopLayout, shopLayoutProblem } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal } from "../../src/game/shopperNavigation.ts";
import type { ShopCart } from "../../src/game/shopCarts.ts";

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

test("empty carts never occupy checkout spots", () => {
  const carts = [cart("a"), { ...cart("empty"), lines: [] }, cart("b")];
  assert.deepEqual(checkoutQueueIds(carts), ["a", "b"]);
});

test("queue positions stay separated with a rotated shelf and high demand", () => {
  const base = createShopLayout();
  const layout = {
    shelves: base.shelves.map(shelf => shelf.id === "shelf-1"
      ? { ...shelf, x: 0, z: -2, rotation: 1 as const }
      : shelf),
  };
  assert.equal(shopLayoutProblem(layout), null);
  const from = {x:0,z:-1};
  const points = checkoutQueuePoints(layout, from, 100);
  assert.ok(points.length > 30);
  assert.ok(points.length <= 100);
  for (const [index, point] of points.entries()) {
    assert.ok(Math.abs(point.x) <= 4.5);
    assert.ok(point.z >= -5.5 && point.z <= 0.5);
    assert.equal(isObstructed(point, layout), false);
    const route = pathToShopGoal(from, point, layout);
    assert.ok(route);
    assert.deepEqual(route.waypoints.at(-1) ?? from, point);
    for (const other of points.slice(0,index))
      assert.ok(Math.hypot(point.x-other.x,point.z-other.z)>=0.75);
  }
  assert.ok(points.length < 100);
  assert.throws(() => checkoutQueuePoint(-1), RangeError);
  assert.throws(() => checkoutQueuePoint(30), RangeError);
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


test("checkout queue front remains aligned with shared legacy counter clearance", () => {
  const frontZ = CHECKOUT_COUNTER.clearanceMinZ - 0.65;
  assert.ok(Math.abs(frontZ - 0.5) < 1e-9);
  const points = checkoutQueuePoints(createShopLayout(), {x:0,z:-1}, 1);
  assert.equal(points.length, 1);
  assert.ok(points[0].z <= frontZ);
  assert.equal(isObstructed(points[0], createShopLayout()), false);
});
