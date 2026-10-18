import { SeededRandom } from "./random.ts";

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
  readonly inventory: { readonly loot: number; readonly food: number };
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
    inventory: { loot: 0, food: 0 },
    floor: 1,
    status: "exploring",
    hunger: 0,
    shopStayDays: 0,
  };
  return { adventurer, rngState: random.state };
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
