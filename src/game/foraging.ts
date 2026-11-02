import type { AdventurerState } from "./adventurers.ts";
import { ECONOMY } from "./economy.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

/**
 * A small, seeded chance to find one meal after SURVIVING an actual encounter.
 * The caller supplies eligible dungeon/combat outcomes, never idle travel or shop days.
 * Physical NPC animations never influence provisions or RNG.
 */
export function forageAfterEncounter(
  hero: AdventurerState, day: number, rngState: number,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number } {
  if (hero.status === "dead" || hero.health === 0 || hero.inventory.food >= ECONOMY.dungeonFoodCarryCap) {
    return { adventurer: hero, events: [], rngState };
  }
  const random = new SeededRandom(rngState);
  if (random.next() >= ECONOMY.dungeonFoodChance) {
    return { adventurer: hero, events: [], rngState: random.state };
  }
  return {
    adventurer: {
      ...hero, inventory: { ...hero.inventory, food: hero.inventory.food + 1 },
    },
    rngState: random.state,
    events: [{
      id: `day-${day}:${hero.id}:found-food`,
      type: "found-food", day, adventurerId: hero.id,
      itemId: "bread", quantity: 1,
      message: `${hero.name} found one ration of Waybread in the dungeon.`,
    }],
  };
}
