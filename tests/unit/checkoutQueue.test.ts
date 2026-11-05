import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutQueueIds, checkoutQueueIndex, checkoutQueuePoint } from "../../src/game/checkoutQueue.ts";
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

test("queue points are distinct, walkable and never inside counter", () => {
  const layout = createShopLayout();
  const points = Array.from({length: 10}, (_, i) => checkoutQueuePoint(i));
  assert.equal(new Set(points.map(p => p.x + ":" + p.z)).size, 10);
  for (const point of points) {
    assert.equal(isObstructed(point, layout), false, JSON.stringify(point));
    assert.ok(pathToShopGoal({x: 0, z: -1}, point, layout), JSON.stringify(point));
  }
  assert.throws(() => checkoutQueuePoint(-1), RangeError);
});
