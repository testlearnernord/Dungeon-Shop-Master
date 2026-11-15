import type { Level5Room } from "./level5Room.ts";
import type { ShopCart } from "./shopCarts.ts";
import { NPC_STATION_CLEARANCE } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, type ShopPoint } from "./shopperNavigation.ts";
import {CHECKOUT_COUNTER,getCounterPlacement,type ShopLayout} from "./shopLayout.ts";
import {
  SHOP_FLOOR_FURNITURE,cashierServicePoint,turnShopOffset,
} from "./shopFloorFurniture.ts";

export function checkoutQueueIds(carts: readonly ShopCart[]): readonly string[] {
  return carts.filter(cart => cart.lines.length > 0).map(cart => cart.heroId);
}

export function checkoutQueueIndex(carts: readonly ShopCart[], heroId: string): number {
  return checkoutQueueIds(carts).indexOf(heroId);
}

/** One physical line at the register; additional shoppers use the existing
 * safe checkout-overflow stands rather than surrounding the cash desk. */
export const CHECKOUT_LINE_MAX_CUSTOMERS=
  SHOP_FLOOR_FURNITURE.counter.service.queueCapacity;
/** Reserve enough real space for service claims, not just NPC collision.
 * 1.1m looked like a queue but the 1.18m service exclusion silently rejected
 * every adjacent cashier claim and forced customers into overflow. */
export const CHECKOUT_QUEUE_SPACING=
  SHOP_FLOOR_FURNITURE.counter.service.queueSpacing;

/** Candidate standing places are deliberately restricted to the shop floor.
 * Queue allocation is based on actual path endpoints, not desired coordinates:
 * path snapping must never cause two customers to share a position.
 */
export function checkoutQueuePoints(layout: ShopLayout, from: ShopPoint, count: number, room?:Level5Room): readonly ShopPoint[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Invalid queue capacity");
  if (count === 0) return [];
  const candidates: ShopPoint[] = [];
  // Derive the front of the queue from the same counter used by rendering and collisions.
  // At the legacy position this starts at z=0.5, preserving existing paths.
  const legacyFrontZ = Math.round((CHECKOUT_COUNTER.clearanceMinZ - 0.65) * 4) / 4;
  const counter = getCounterPlacement(layout);
  // A moved counter may cover the legacy planning origin (0,-1). Never
  // declare the whole queue unreachable merely because that origin is blocked.
  const customer=cashierServicePoint(counter,"customer");
  const outside=turnShopOffset(0,-0.30,counter.rotation);
  const fallback={x:customer.x+outside.x,z:customer.z+outside.z};
  const origin=isObstructed(from,layout,room)?fallback:from;
  // A visible single-file queue, never an audience crowding the till.
  // Beyond five customers (or the first blocked section of the lane),
  // existing service overflow holding spots handle the excess shoppers.
  // Capacity may be smaller for a counter moved next to an actual wall.
  for(let step=0;step<Math.min(count,CHECKOUT_LINE_MAX_CUSTOMERS);step++){
    const first=layout.counter?customer:{
      x:counter.x+turnShopOffset(0,legacyFrontZ-counter.z,counter.rotation).x,
      z:counter.z+turnShopOffset(0,legacyFrontZ-counter.z,counter.rotation).z,
    };
    const offset=turnShopOffset(0,-step*CHECKOUT_QUEUE_SPACING,counter.rotation);
    const point={x:first.x+offset.x,z:first.z+offset.z};
    // No snaking sideways around furniture: an interrupted line ends here
    // and the remaining buyers wait in their own safe overflow pockets.
    if(isObstructed(point,layout,room))break;
    candidates.push(point);
  }
  const allocated: ShopPoint[] = [];
  for (const candidate of candidates) {
    if (allocated.length >= count) break;
    const route = pathToShopGoal(origin, candidate, layout, room);
    if (!route) continue;
    const endpoint = route.waypoints.at(-1) ?? origin;
    // Never silently route a checkout customer to some nearest grid cell.
    if (isObstructed(endpoint, layout, room) ||
        Math.hypot(endpoint.x-candidate.x,endpoint.z-candidate.z)>0.17) continue;
    if (allocated.some(point => Math.hypot(point.x-endpoint.x,point.z-endpoint.z) < NPC_STATION_CLEARANCE)) continue;
    allocated.push(endpoint);
  }
  return allocated;
}

/** No queue point is fabricated when the shop has no remaining safe capacity. */
export function checkoutQueuePoint(index: number): ShopPoint {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Invalid queue index");
  if (index >= 5) throw new RangeError("Queue capacity requires layout-aware allocation");
  return {x:0,z:0.65-index*CHECKOUT_QUEUE_SPACING};
}
