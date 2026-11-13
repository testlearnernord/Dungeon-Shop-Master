import { SeededRandom } from "./random.ts";
import { ECONOMY, ITEMS } from "./economy.ts";
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

/** Adventurers heal injuries, never consume provisions just because a day passed.
 * Waybread is inexpensive +8 HP first aid; herbs heal +18 HP. One dose a day,
 * with bread reserved for smaller wounds when both supplies are available. */
export function useHealingSupplies(hero: AdventurerState, day: number): {
  adventurer: AdventurerState; events: WorldEvent[];
} {
  if (hero.status === "dead" || hero.health >= hero.stats.maxHealth)
    return { adventurer: hero, events: [] };
  const missing = hero.stats.maxHealth - hero.health;
  const herb = ITEMS.find(item => item.id === "healing-herb")!;
  const bread = ITEMS.find(item => item.id === "bread")!;
  const useHerb = hero.inventory.healing > 0 &&
    (missing > 12 || hero.inventory.bread === 0);
  const used = useHerb ? herb : hero.inventory.bread > 0 ? bread : null;
  if (!used) return { adventurer: hero, events: [] };
  const restored = Math.min(missing, used.healing);
  const inventory = { ...hero.inventory,
    bread: hero.inventory.bread - (used.id === "bread" ? 1 : 0),
    healing: hero.inventory.healing - (used.id === "healing-herb" ? 1 : 0),
  };
  return {
    adventurer: { ...hero, health: hero.health + restored, inventory },
    events: [{
      id: `day-${day}:${hero.id}:healed`, type: "healed", day,
      adventurerId: hero.id, itemId: used.id, quantity: 1,
      message: `${hero.name} used ${used.name} and recovered ${restored} HP.`,
    }],
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
