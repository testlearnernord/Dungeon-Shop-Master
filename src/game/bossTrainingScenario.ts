import type { CombatPreviewOptions } from "./arenaCombatMotion.ts";

/** Purely presentational, disposable sparring partners. Never used by GameStore
 * or resolveSpatialBoss; saved encounters keep their recorded participants. */
const PRESETS: readonly {
  label: string;
  options: Omit<CombatPreviewOptions, "tacticsSeed">;
}[] = [
  { label: "Wandering archer", options: {
    role: "DPS", sword: false, armor: true, health: 116, maxHealth: 116,
    healingSupplies: 2, strength: 9, agility: 14, intellect: 8,
  }},
  { label: "Battle healer", options: {
    role: "healer", sword: false, armor: true, health: 120, maxHealth: 120,
    healingSupplies: 3, strength: 8, agility: 10, intellect: 14,
  }},
  { label: "Shieldless bruiser", options: {
    role: "tank", sword: false, armor: true, health: 148, maxHealth: 148,
    healingSupplies: 3, strength: 14, agility: 8, intellect: 5,
  }},
  { label: "Ironblade raider", options: {
    role: "DPS", sword: true, armor: true, health: 126, maxHealth: 126,
    healingSupplies: 2, strength: 14, agility: 12, intellect: 6,
  }},
];
let lastPreset = -1;
let sequence = 0;

export interface BossTrainingScenario {
  readonly id: string;
  readonly label: string;
  readonly options: CombatPreviewOptions;
}

/** Randomize each new training battle while guaranteeing consecutive variants
 * differ. Math.random is deliberately isolated from authoritative day RNG. */
export function nextBossTrainingScenario(random: () => number = Math.random): BossTrainingScenario {
  const pick = (limit: number) => Math.max(0,Math.min(limit-1,Math.floor(random()*limit)));
  let index = pick(PRESETS.length);
  if (index === lastPreset) index = (index + 1 + pick(PRESETS.length - 1)) % PRESETS.length;
  lastPreset = index;
  const number = ++sequence;
  const preset = PRESETS[index]!;
  const tacticsSeed = pick(1000000) + number;
  return {
    id: "training-" + number,
    label: preset.label + " · variation " + number,
    options: { ...preset.options, tacticsSeed },
  };
}
