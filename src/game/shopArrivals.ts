import type { AdventurerState } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

export function arrivalEvent(hero: AdventurerState, day: number): WorldEvent {
  return {
    id: `day-${day}:${hero.id}:shop-arrival`,
    type: "shop-arrival",
    day,
    adventurerId: hero.id,
    message: `${hero.name} emerged at Galvik\'s cursed shop.`,
  };
}

/** A confirmed purchase ends the current visit at closing. Do not reroll a
 * paid shopper into another day in the store after the physical NPC has
 * already headed out. A dungeon-bound departure is handled by the same saved shop-exit flow.
 */
export function scheduleShopVisit(
  hero: AdventurerState, day: number, rngState: number,
  alreadyBought: boolean = false, livePhysicalExit = false,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number } {
  if (hero.status === "traveling") {
    return {
      adventurer: { ...hero, floor: "shop", status: "at-shop",
        // Legacy day-based fixture: physical finds persist, but old
        // abstract chest haul no longer triggers endless resupply loops.
        inventory:{...hero.inventory,loot:0} },
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
      floor: stay || livePhysicalExit ? "shop" : 4,
      status: stay ? "at-shop" : livePhysicalExit ? "departing" : "returning",
      shopStayDays: stay ? 1 : 0,
    },
    events: !stay && livePhysicalExit ? [] : [{
      id: `day-${day}:${hero.id}:shop-${stay ? "stay" : "departure"}`,
      type: stay ? "shop-stay" : "shop-departure",
      day,
      adventurerId: hero.id,
      message: stay ? `${hero.name} remains at the shop.` : `${hero.name} sets out for another dungeon expedition.`,
    }],
  };
}
