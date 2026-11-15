import type { AdventurerState } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

export function arrivalEvent(hero: AdventurerState, day: number): WorldEvent {
  return {
    id: `day-${day}:${hero.id}:shop-arrival`,
    type: "shop-arrival",
    day,
    adventurerId: hero.id,
    message: `${hero.name} arrived at the Level 5 shop.`,
  };
}

/** A confirmed purchase ends the current visit at closing. Do not reroll a
 * paid shopper into another day in the store after the physical NPC has
 * already headed out. An authorized Level 6 departure is handled upstream.
 */
export function scheduleShopVisit(
  hero: AdventurerState, day: number, rngState: number,
  alreadyBought: boolean = false,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number } {
  if (hero.status === "traveling") {
    return {
      adventurer: { ...hero, floor: 5, status: "at-shop" },
      events: [arrivalEvent(hero, day)],
      rngState,
    };
  }
  if (hero.status !== "at-shop") return { adventurer: hero, events: [], rngState };

  // Only shoppers who have not completed their purchase can opt to
  // spend a second day at Galvik's store. Avoid consuming RNG when the
  // result is already settled; replayed day ticks remain deterministic.
  const random = new SeededRandom(rngState);
  const stay = !alreadyBought && hero.shopStayDays === 0 && random.next() < 0.35;
  return {
    rngState: random.state,
    adventurer: {
      ...hero,
      floor: stay ? 5 : 4,
      status: stay ? "at-shop" : "returning",
      shopStayDays: stay ? 1 : 0,
    },
    events: [{
      id: `day-${day}:${hero.id}:shop-${stay ? "stay" : "departure"}`,
      type: stay ? "shop-stay" : "shop-departure",
      day,
      adventurerId: hero.id,
      message: stay ? `${hero.name} remains at the shop.` : `${hero.name} returns to floor 4.`,
    }],
  };
}
