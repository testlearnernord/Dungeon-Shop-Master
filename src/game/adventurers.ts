import { SeededRandom } from "./random.ts";
import { ECONOMY, ITEMS } from "./economy.ts";
import type { WorldEvent } from "./gameState.ts";

export type AdventurerRole = "tank" | "DPS" | "healer";
export type AdventurerStatus = "exploring" | "traveling" | "at-shop" | "returning" | "dead";
export type DungeonFloor = 1 | 2 | 3 | 4 | 5;

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
  readonly inventory: { readonly loot: number; readonly food: number; readonly healing: number };
  readonly floor: DungeonFloor;
  readonly status: AdventurerStatus;
  readonly hunger: number;
  readonly shopStayDays: number;
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
    inventory: { loot: 0, food: 0, healing: 0 },
    floor: 1,
    status: "exploring",
    hunger: 0,
    shopStayDays: 0,
  };
  return { adventurer, rngState: random.state };
}

export function consumeDailySupplies(hero: AdventurerState, day: number): {
  adventurer: AdventurerState; events: WorldEvent[];
} {
  if (hero.status === "dead") return { adventurer: hero, events: [] };
  const events: WorldEvent[] = [];
  let health = hero.health;
  let hunger = hero.hunger;
  let { food, healing } = hero.inventory;
  if (food > 0) {
    food -= 1;
    hunger = Math.max(0, hunger - ITEMS.find((item) => item.id === "bread")!.hunger);
    events.push({
      id: `day-${day}:${hero.id}:ate`, type: "ate", day, adventurerId: hero.id,
      itemId: "bread", quantity: 1, message: `${hero.name} ate Waybread.`,
    });
  } else {
    hunger += 1;
  }
  if (healing > 0 && health < hero.stats.maxHealth) {
    healing -= 1;
    health = Math.min(hero.stats.maxHealth, health + ITEMS.find((item) => item.id === "healing-herb")!.healing);
    events.push({
      id: `day-${day}:${hero.id}:healed`, type: "healed", day, adventurerId: hero.id,
      itemId: "healing-herb", quantity: 1, message: `${hero.name} used a Healing Herb.`,
    });
  }
  if (hunger >= ECONOMY.starvationThreshold) {
    health = Math.max(0, health - ECONOMY.starvationDamage);
    events.push({
      id: `day-${day}:${hero.id}:starvation`, type: "starvation", day, adventurerId: hero.id,
      message: `${hero.name} suffered starvation${health === 0 ? " and died" : ""}.`,
    });
  }
  return {
    adventurer: { ...hero, health, hunger, status: health === 0 ? "dead" : hero.status,
      inventory: { ...hero.inventory, food, healing } },
    events,
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
