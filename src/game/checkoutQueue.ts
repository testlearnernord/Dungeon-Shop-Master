import type { ShopCart } from "./shopCarts.ts";
import type { ShopPoint } from "./shopperNavigation.ts";

/**
 * Pure, visual checkout queue. Cart order is the stable reservation order,
 * never the order in which Babylon renders the NPCs.
 * The register is at the north end of the central shop aisle.
 */
export function checkoutQueueIds(carts: readonly ShopCart[]): readonly string[] {
  return carts.filter(cart => cart.lines.length > 0).map(cart => cart.heroId);
}

/** The front visitor stands south of the counter, not inside its collision box. */
export function checkoutQueuePoint(index: number): ShopPoint {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Invalid queue index");
  // Five central aisle positions; overflow snakes to the adjacent safe
  // waiting strip. This avoids spawning a line through the Level 4/6 doors.
  if (index < 5) return { x: 0, z: 0.65 - index * 1.1 };
  const overflow = index - 5;
  return { x: overflow % 2 === 0 ? -2.9 : 2.9,
    z: -4.25 + Math.floor(overflow / 2) * 1.05 };
}

export function checkoutQueueIndex(
  carts: readonly ShopCart[], heroId: string,
): number {
  return checkoutQueueIds(carts).indexOf(heroId);
}
