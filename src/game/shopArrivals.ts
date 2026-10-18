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

export function scheduleShopVisit(
  hero: AdventurerState, day: number, random: SeededRandom,
): { adventurer: AdventurerState; events: readonly WorldEvent[] } {
  if (hero.status === "traveling") {
    return {
      adventurer: { ...hero, floor: 5, status: "at-shop" },
      events: [arrivalEvent(hero, day)],
    };
  }
  if (hero.status !== "at-shop") return { adventurer: hero, events: [] };

  // At most two consecutive shop days; no transactions or food are created here.
  const stay = hero.shopStayDays === 0 && random.next() < 0.35;
  return {
    adventurer: {
      ...hero,
      health: Math.min(hero.stats.maxHealth, hero.health + 8),
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
