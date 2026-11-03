import type { AdventurerState } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

export type Level6CombatOutcome = "victory" | "retreat" | "death";
const ENEMIES = [
  { name: "Tunnel Vermin", maxHealth: 14, attack: 3, defense: 1 },
  { name: "Bone Sentry", maxHealth: 19, attack: 5, defense: 2 },
  { name: "Cavern Stalker", maxHealth: 23, attack: 6, defense: 2 },
] as const;
const MAX_ROUNDS = 6;

export function simulateLevel6Combat(
  hero: AdventurerState, day: number, rngState: number,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number; victory: boolean } {
  if (hero.status !== "expedition" || hero.floor !== 6 || hero.health <= 0) {
    return { adventurer: hero, events: [], rngState, victory: false };
  }
  const rng = new SeededRandom(rngState);
  const enemy = ENEMIES[rng.int(ENEMIES.length)];
  let enemyHealth: number = enemy.maxHealth;
  let health = hero.health;
  let rounds = 0;
  while (rounds < MAX_ROUNDS && health > 0 && enemyHealth > 0) {
    rounds += 1;
    const heroHit = Math.max(1,
      2 + Math.floor((hero.stats.strength + hero.stats.agility) / 5)
        + (hero.role === "DPS" ? 2 : 0)
        + (hero.equipment.weapon === "Iron Sword" ? 3 : 0)
        + rng.int(5) - enemy.defense);
    enemyHealth = Math.max(0, enemyHealth - heroHit);
    if (enemyHealth === 0) break;
    const enemyHit = Math.max(1, enemy.attack + rng.int(5)
      - Math.floor(hero.stats.agility / 5) - (hero.role === "tank" ? 1 : 0)
      - (hero.equipment.armor === "Leather Vest" ? 2 : 0));
    health = Math.max(0, health - enemyHit);
  }
  const victory = enemyHealth === 0 && health > 0;
  const outcome: Level6CombatOutcome = health === 0 ? "death" : victory ? "victory" : "retreat";
  const xpGain = victory ? 16 + rng.int(10) : 0;
  const goldGain = victory ? 4 + rng.int(6) : 0;
  const lootGain = victory && rng.int(3) === 0 ? 1 : 0;
  const adventurer: AdventurerState = {
    ...hero, status: outcome === "death" ? "dead" : "traveling",
    floor: outcome === "death" ? 6 : 4,
    health: outcome === "death" ? 0 : health,
    xp: hero.xp + xpGain, level: 1 + Math.floor((hero.xp + xpGain) / 100),
    gold: hero.gold + goldGain,
    inventory: { ...hero.inventory, loot: hero.inventory.loot + lootGain },
  };
  const events: WorldEvent[] = [{
    id: `day-${day}:${hero.id}:level6-combat`,
    type: "level6-combat", combatOutcome: outcome, day, adventurerId: hero.id,
    message: `${hero.name} fought ${enemy.name} on Level 6 (${rounds} rounds): ${outcome}. HP ${hero.health}→${health}; XP +${xpGain}, gold +${goldGain}, loot +${lootGain}.`,
  }];
  if (outcome !== "death") events.push({
    id: `day-${day}:${hero.id}:level6-return`, type: "level6-return",
    day, adventurerId: hero.id, message: `${hero.name} is returning to the Level 5 shop.`,
  });
  return { adventurer, events, rngState: rng.state, victory };
}
