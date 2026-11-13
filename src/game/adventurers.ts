import { SeededRandom } from "./random.ts";
import { ITEMS } from "./economy.ts";
import type { WorldEvent } from "./gameState.ts";

export type AdventurerRole = "tank" | "DPS" | "healer";
export type AdventurerStatus = "exploring" | "traveling" | "at-shop" | "returning" | "expedition" | "dead";
export type DungeonFloor = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AdventurerState {
  readonly id: string;
  readonly name: string;
  readonly role: AdventurerRole;
  readonly stats: {
    readonly strength: number;
    readonly agility: number;
    readonly intellect: number;
    readonly maxHealth: number;
  };
  readonly traits: {
    readonly positive: string;
    readonly neutral: string;
    readonly negative: string;
  };
  readonly level: number;
  readonly xp: number;
  readonly health: number;
  readonly gold: number;
  readonly equipment: { readonly weapon: string | null; readonly armor: string | null };
  readonly inventory: { readonly loot: number; readonly bread: number; readonly healing: number };
  readonly floor: DungeonFloor;
  readonly status: AdventurerStatus;
  readonly shopStayDays: number;
  /** Explicit, player-controlled future access to dungeon Level 6. */
  readonly level6Permit: boolean;
}

const names = ["Ada", "Bram", "Cora", "Dain", "Eira", "Finn", "Gwen", "Hale", "Iris", "Joss"];
const surnames = ["Flint", "Moss", "Reed", "Vale", "Ash", "Stone"];
const roles: readonly AdventurerRole[] = ["tank", "DPS", "healer"];

export function generateAdventurer(serial: number, rngState: number): { adventurer: AdventurerState; rngState: number } {
  const random = new SeededRandom(rngState);
  const name = `${names[random.int(names.length)]} ${surnames[random.int(surnames.length)]}`;
  const role = roles[random.int(roles.length)];
  const maxHealth = (role === "tank" ? 55 : 40) + random.int(11);
  const adventurer: AdventurerState = {
    id: `adventurer-${serial}`,
    name,
    role,
    stats: {
      strength: 5 + random.int(6),
      agility: 5 + random.int(6),
      intellect: 5 + random.int(6),
      maxHealth,
    },
    traits: {
      positive: ["brave", "careful", "generous"][random.int(3)],
      neutral: ["quiet", "curious", "talkative"][random.int(3)],
      negative: ["reckless", "greedy", "stubborn"][random.int(3)],
    },
    level: 1,
    xp: 0,
    health: maxHealth,
    gold: 5 + random.int(11),
    equipment: { weapon: null, armor: null },
    inventory: { loot: 0, bread: 0, healing: 0 },
    floor: 1,
    status: "exploring",
    shopStayDays: 0,
    level6Permit: false,
  };
  return { adventurer, rngState: random.state };
}

/**
 * Healing is spent only on actual HP loss. Bread is the economical +8 HP
 * option for light wounds; herbs recover +18 HP and win on severe wounds.
 * No passive attrition, daily ration tax or hunger state exists.
 */
export function useHealingSupplies(hero: AdventurerState, day: number): {
  adventurer: AdventurerState; events: WorldEvent[];
} {
  if (hero.status === "dead" || hero.health >= hero.stats.maxHealth)
    return { adventurer: hero, events: [] };
  const missing = hero.stats.maxHealth - hero.health;
  const itemId = missing <= 8 && hero.inventory.bread > 0 ? "bread"
    : missing > 8 && hero.inventory.healing > 0 ? "healing-herb"
    : hero.inventory.bread > 0 ? "bread"
    : hero.inventory.healing > 0 ? "healing-herb" : null;
  if (!itemId) return { adventurer: hero, events: [] };
  const item = ITEMS.find(entry => entry.id === itemId)!;
  const health = Math.min(hero.stats.maxHealth, hero.health + item.healing);
  const inventory = { ...hero.inventory,
    bread: hero.inventory.bread - (itemId === "bread" ? 1 : 0),
    healing: hero.inventory.healing - (itemId === "healing-herb" ? 1 : 0),
  };
  return {
    adventurer: { ...hero, health, inventory },
    events: [{ id: `day-${day}:${hero.id}:healed`, type: "healed",
      day, adventurerId: hero.id, itemId, quantity: 1,
      message: `${hero.name} used ${item.name} and recovered ${health - hero.health} HP.` }],
  };
}

export function generateStartingPopulation(rngState: number): { adventurers: readonly AdventurerState[]; rngState: number } {
  const random = new SeededRandom(rngState);
  const adventurers = Array.from({ length: 10 }, (_, index) => {
    const generated = generateAdventurer(index + 1, random.state);
    random.state = generated.rngState;
    const hero = generated.adventurer;
    return index < 3
      ? { ...hero, floor: 5 as const, status: "at-shop" as const }
      : { ...hero, floor: (1 + random.int(4)) as DungeonFloor };
  });
  return { adventurers, rngState: random.state };
}
