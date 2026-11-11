import type { ShopCart } from "./shopCarts.ts";
import { NPC_CENTER_CLEARANCE } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, type ShopPoint } from "./shopperNavigation.ts";
import { CHECKOUT_COUNTER, COMPACT_COUNTER, getCounterPlacement, rotateShelfOffset, type ShopLayout } from "./shopLayout.ts";

export function checkoutQueueIds(carts: readonly ShopCart[]): readonly string[] {
  return carts.filter(cart => cart.lines.length > 0).map(cart => cart.heroId);
}

export function checkoutQueueIndex(carts: readonly ShopCart[], heroId: string): number {
  return checkoutQueueIds(carts).indexOf(heroId);
}

/** Candidate standing places are deliberately restricted to the shop floor.
 * Queue allocation is based on actual path endpoints, not desired coordinates:
 * path snapping must never cause two customers to share a position.
 */
export function checkoutQueuePoints(layout: ShopLayout, from: ShopPoint, count: number): readonly ShopPoint[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Invalid queue capacity");
  if (count === 0) return [];
  const candidates: ShopPoint[] = [];
  // Derive the front of the queue from the same counter used by rendering and collisions.
  // At the legacy position this starts at z=0.5, preserving existing paths.
  const legacyFrontZ = Math.round((CHECKOUT_COUNTER.clearanceMinZ - 0.65) * 4) / 4;
  const counter = getCounterPlacement(layout);
  // A moved counter may cover the legacy planning origin (0,-1). Never
  // declare the whole queue unreachable merely because that origin is blocked.
  const safeFront=rotateShelfOffset(0,
    -COMPACT_COUNTER.clearanceDepth/2-0.95,counter.rotation);
  const fallback={x:counter.x+safeFront.x,z:counter.z+safeFront.z};
  const origin=isObstructed(from,layout)?fallback:from;
  for (let step = 0; step <= 8; step++) {
    for (const x of [0, -1.1, 1.1, -2.2, 2.2, -3.3, 3.3, -4.4, 4.4]) {
      const localZ = layout.counter
        ? -COMPACT_COUNTER.clearanceDepth / 2 - 0.65 - step * 1.1
        : legacyFrontZ - counter.z - step * 1.1;
      const rotated = rotateShelfOffset(x, localZ, counter.rotation);
      const point = {x:counter.x + rotated.x,z:counter.z + rotated.z};
      if (isObstructed(point, layout)) continue;
      candidates.push(point);
    }
  }
  const allocated: ShopPoint[] = [];
  for (const candidate of candidates) {
    if (allocated.length >= count) break;
    const route = pathToShopGoal(origin, candidate, layout);
    if (!route) continue;
    const endpoint = route.waypoints.at(-1) ?? origin;
    if (isObstructed(endpoint, layout)) continue;
    if (allocated.some(point => Math.hypot(point.x-endpoint.x,point.z-endpoint.z) < NPC_CENTER_CLEARANCE)) continue;
    allocated.push(endpoint);
  }
  return allocated;
}

/** No queue point is fabricated when the shop has no remaining safe capacity. */
export function checkoutQueuePoint(index: number): ShopPoint {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Invalid queue index");
  if (index >= 5) throw new RangeError("Queue capacity requires layout-aware allocation");
  return {x:0,z:0.65-index*1.1};
}
