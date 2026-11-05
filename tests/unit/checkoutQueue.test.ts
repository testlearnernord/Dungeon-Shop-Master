import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutQueueIds, checkoutQueueIndex, checkoutQueuePoint, checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { createShopLayout } from "../../src/game/shopLayout.ts";
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
  assert.deepEqual(checkoutQueueIds(carts.filter(c => c.heroId !== "b")), ["a", "c"]);
});

test("empty carts never occupy checkout spots", () => {
  const carts = [cart("a"), { ...cart("empty"), lines: [] }, cart("b")];
  assert.deepEqual(checkoutQueueIds(carts), ["a", "b"]);
});

test("queue positions stay separated with a rotated shelf and high demand", () => {
  const layout = createShopLayout();
  const points = checkoutQueuePoints(layout, {x:0,z:-1}, 100);
  assert.ok(points.length > 0);
  assert.ok(points.length <= 100);
  for (const [index, point] of points.entries()) {
    assert.equal(isObstructed(point, layout), false);
    assert.ok(pathToShopGoal({x:0,z:-1}, point, layout));
    for (const other of points.slice(0,index))
      assert.ok(Math.hypot(point.x-other.x,point.z-other.z)>=0.75);
  }
  assert.throws(() => checkoutQueuePoint(-1), RangeError);
  assert.throws(() => checkoutQueuePoint(30), RangeError);
});
