import type { AdventurerState, DungeonFloor } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

export type DungeonOutcome = "advance" | "stay" | "retreat" | "death";

export function simulateDungeon(
  hero: AdventurerState, day: number, rngState: number,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number } {
  if (hero.status !== "exploring" && hero.status !== "returning") {
    return { adventurer: hero, events: [], rngState };
  }
  const random = new SeededRandom(rngState);
  const roll = random.next();
  const damage = 1 + random.int(6) + hero.floor;
  const health = Math.max(0, hero.health - damage);
  const outcome: DungeonOutcome = health === 0 || roll < 0.04 ? "death"
    : roll < 0.22 ? "retreat" : roll < 0.70 ? "advance" : "stay";
  const survived = outcome !== "death";
  const xp = survived ? 8 + random.int(13) : 0;
  const gold = survived && outcome !== "retreat" ? random.int(5) : 0;
  const loot = gold > 0 && random.int(5) === 0 ? 1 : 0;
  const traveling = outcome === "advance" && hero.floor === 4;
  const floor = outcome === "advance" ? Math.min(4, hero.floor + 1)
    : outcome === "retreat" ? Math.max(1, hero.floor - 1) : hero.floor;
  const adventurer: AdventurerState = {
    ...hero,
    floor: floor as DungeonFloor,
    status: survived ? (traveling ? "traveling" : "exploring") : "dead",
    health: survived ? health : 0,
    xp: hero.xp + xp,
    level: 1 + Math.floor((hero.xp + xp) / 100),
    gold: hero.gold + gold,
    inventory: { ...hero.inventory, loot: hero.inventory.loot + loot },
  };
  return {
    adventurer,
    rngState: random.state,
    events: [{
      id: `day-${day}:${hero.id}:dungeon`,
      type: "dungeon-outcome",
      day,
      adventurerId: hero.id,
      outcome,
      message: `${hero.name}: ${outcome} on floor ${hero.floor}; HP -${hero.health - adventurer.health}, XP +${xp}, gold +${gold}, loot +${loot}.`,
    }],
  };
}
