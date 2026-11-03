import type { AdventurerState } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";
import { resolveSpatialBoss } from "./bossCombatReplay.ts";

export type Level6CombatOutcome = "victory" | "retreat" | "death";
export type CombatActionKind = "approach" | "attack" | "ranged" | "windup" |
  "dodge" | "parry" | "block" | "smash" | "heal" | "lava" | "stagger" | "finish" | "miss";
export interface BossCombatAction {
  readonly round: number;
  readonly actor: "hero" | "troll";
  readonly kind: CombatActionKind;
  readonly damage?: number;
  readonly heal?: number;
  readonly heroHp: number;
  readonly bossHp: number;
  readonly edgeDistance: number;
}

/**
 * The spatial, fixed-step motor is now the ONLY source of both saved combat
 * outcome and spectatable hits. We persist a bounded replay of that very run.
 * No browser animation can change the confirmed turn's result.
 */
export function simulateLevel6Combat(
  hero: AdventurerState, day: number, rngState: number,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number;
  victory: boolean; actions: readonly BossCombatAction[] } {
  if (hero.status !== "expedition" || hero.floor !== 6 || hero.health <= 0) {
    return { adventurer: hero, events: [], rngState, victory: false, actions: [] };
  }
  const rng = new SeededRandom(rngState);
  const tacticsSeed = rng.int(32);
  const { final, replay } = resolveSpatialBoss(hero.id, day, {
    role: hero.role,
    sword: hero.equipment.weapon === "Iron Sword",
    armor: hero.equipment.armor === "Leather Vest",
    health: hero.health, maxHealth: hero.stats.maxHealth,
    healingSupplies: hero.inventory.healing,
    strength: hero.stats.strength, agility: hero.stats.agility,
    intellect: hero.stats.intellect,
    tacticsSeed,
  });
  const victory = replay.outcome === "victory";
  const xpGain = victory ? 35 + rng.int(21) : 0;
  const goldGain = victory ? 15 + rng.int(11) : 0;
  const lootGain = victory ? 2 + rng.int(2) : 0;
  const outcome = replay.outcome;
  const adventurer: AdventurerState = {
    ...hero,
    status: outcome === "death" ? "dead" : "traveling",
    floor: outcome === "death" ? 6 : 4,
    health: outcome === "death" ? 0 : final.heroHp,
    xp: hero.xp + xpGain,
    level: 1 + Math.floor((hero.xp + xpGain) / 100),
    gold: hero.gold + goldGain,
    inventory: {
      ...hero.inventory,
      healing: final.healingSupplies,
      loot: hero.inventory.loot + lootGain,
    },
  };
  const actions: BossCombatAction[] = [{
    round: 0, actor: "hero", kind: "approach",
    heroHp: hero.health, bossHp: 145, edgeDistance: 7,
  }];
  let round = 0;
  for (const frame of replay.frames) {
    round = Math.max(round, Math.floor(frame.t / 2) + 1);
    for (const cue of frame.cues) {
      const actor: BossCombatAction["actor"] =
        ["windup","hit","miss","stagger","lava","defeat"].includes(cue.kind) ? "troll" : "hero";
      const kind: CombatActionKind =
        cue.kind === "hero-hit" ? (hero.role === "healer" ? "ranged" : "attack") :
        cue.kind === "projectile" ? "ranged" :
        cue.kind === "hit" ? (hero.role === "tank" || hero.equipment.armor ? "block" : "smash") :
        cue.kind === "victory" || cue.kind === "defeat" ? "finish" : cue.kind;
      const action: BossCombatAction = {
        round, actor, kind, heroHp: frame.heroHp, bossHp: frame.bossHp,
        edgeDistance: Math.hypot(frame.hx,frame.hz),
        ...(cue.kind === "hero-hit" || cue.kind === "hit" ? { damage: cue.amount } : {}),
        ...(cue.kind === "heal" ? { heal: cue.amount } : {}),
      };
      actions.push(action);
    }
  }
  const events: WorldEvent[] = [{
    id: "day-" + day + ":" + hero.id + ":level6-combat",
    type: "level6-combat", combatOutcome: outcome, day, adventurerId: hero.id,
    combatReplay: replay,
    message: hero.name + " faced the Cave Troll (Level 6, spatial combat): " + outcome +
      ". Hero HP " + hero.health + "→" + final.heroHp + ", troll 145→" + final.bossHp +
      "; " + actions.length + " recorded actions; XP +" + xpGain +
      ", gold +" + goldGain + ", loot +" + lootGain + ".",
  }];
  if (outcome !== "death") events.push({
    id: "day-" + day + ":" + hero.id + ":level6-return",
    type: "level6-return", day, adventurerId: hero.id,
    message: hero.name + " is returning to the Level 5 shop.",
  });
  return { adventurer, events, rngState: rng.state, victory, actions };
}
