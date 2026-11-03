import type { AdventurerState } from "./adventurers.ts";
import type { WorldEvent } from "./gameState.ts";
import { SeededRandom } from "./random.ts";

export type Level6CombatOutcome = "victory" | "retreat" | "death";
export type CombatActionKind = "approach" | "attack" | "ranged" | "windup" |
  "dodge" | "parry" | "block" | "smash" | "heal" | "lava" | "stagger" | "finish";
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
const BOSS_HP = 145;
const MAX_ROUNDS = 21;
const LAVA_EDGE = 17;

/** Authoritative deterministic Level 6 troll encounter.
 * Animation can consume the action transcript without rerolling gameplay.
 */
export function simulateLevel6Combat(
  hero: AdventurerState, day: number, rngState: number,
): { adventurer: AdventurerState; events: readonly WorldEvent[]; rngState: number;
  victory: boolean; actions: readonly BossCombatAction[] } {
  if (hero.status !== "expedition" || hero.floor !== 6 || hero.health <= 0) {
    return { adventurer: hero, events: [], rngState, victory: false, actions: [] };
  }
  const rng = new SeededRandom(rngState);
  const armored = hero.equipment.armor === "Leather Vest";
  const armed = hero.equipment.weapon === "Iron Sword";
  const actions: BossCombatAction[] = [];
  let health = hero.health;
  let bossHealth = BOSS_HP;
  let edgeDistance = 7;
  let healItems = hero.inventory.healing;
  let magicHeals = hero.role === "healer" ? 2 : 0;
  let rounds = 0;
  const record = (actor: BossCombatAction["actor"], kind: CombatActionKind,
    damage?: number, heal?: number): void => {
    actions.push({ round: rounds, actor, kind, heroHp: health,
      bossHp: bossHealth, edgeDistance,
      ...(damage === undefined ? {} : { damage }),
      ...(heal === undefined ? {} : { heal }) });
  };
  record("hero", "approach");
  while (rounds < MAX_ROUNDS && health > 0 && bossHealth > 0) {
    rounds++;
    // Role-specific AI and finite healing resources. This is not player input.
    if (health <= hero.stats.maxHealth * 0.55 && (healItems > 0 || magicHeals > 0)) {
      const usingItem = healItems > 0;
      if (usingItem) healItems--; else magicHeals--;
      const before = health;
      health = Math.min(hero.stats.maxHealth, health + (usingItem ? 18 : 18 + Math.floor(hero.stats.intellect / 3)));
      record("hero", "heal", undefined, health - before);
    }
    const trollWillSwing = rounds % 2 === 0;
    if (trollWillSwing) record("troll", "windup");
    const attack = hero.role === "healer"
      ? 5 + Math.floor(hero.stats.intellect * 0.75) + (armed ? 3 : 0)
      : 2 + Math.floor(hero.stats.strength * 0.7) +
        (hero.role === "DPS" ? 3 : 0) + (armed ? 9 : 0);
    const hit = Math.max(1, attack + rng.int(5) - 2);
    bossHealth = Math.max(0, bossHealth - hit);
    record("hero", hero.role === "healer" ? "ranged" : "attack", hit);
    if (bossHealth === 0) {
      record("hero", "finish");
      break;
    }
    if (!trollWillSwing) continue;
    const dodgeChance = hero.role === "DPS" ? 0.43
      : hero.role === "healer" ? 0.36 : 0.14;
    if (rng.next() < dodgeChance) {
      edgeDistance = Math.max(5.5, edgeDistance - 1);
      record("hero", "dodge");
      continue;
    }
    const parryChance = hero.role === "tank" ? (armed ? 0.43 : 0.06)
      : armed ? 0.12 : 0.03;
    if (rng.next() < parryChance) {
      record("hero", "parry");
      bossHealth = Math.max(0, bossHealth - (armed ? 7 : 2));
      record("troll", "stagger", armed ? 7 : 2);
      if (bossHealth === 0) record("hero", "finish");
      continue;
    }
    const slam = rounds % 6 === 0;
    const raw = (slam ? 20 : 15) + rng.int(7);
    const defense = (armored ? 7 : 0) + (hero.role === "tank" ? 3 : 0);
    const damage = Math.max(1, raw - defense);
    health = Math.max(0, health - damage);
    edgeDistance += slam ? (armored ? 1.5 : 3.5) : 0.8;
    record(defense ? "hero" : "troll", defense ? "block" : "smash", damage);
    if (edgeDistance >= LAVA_EDGE && health > 0) {
      health = 0;
      record("troll", "lava", 999);
    }
  }
  const victory = bossHealth === 0 && health > 0;
  const outcome: Level6CombatOutcome =
    health <= 0 ? "death" : victory ? "victory" : "retreat";
  const xpGain = victory ? 35 + rng.int(21) : 0;
  const goldGain = victory ? 15 + rng.int(11) : 0;
  const lootGain = victory ? 2 + rng.int(2) : 0;
  const adventurer: AdventurerState = {
    ...hero, status: outcome === "death" ? "dead" : "traveling",
    floor: outcome === "death" ? 6 : 4,
    health: outcome === "death" ? 0 : health,
    xp: hero.xp + xpGain,
    level: 1 + Math.floor((hero.xp + xpGain) / 100),
    gold: hero.gold + goldGain,
    inventory: { ...hero.inventory, healing: healItems,
      loot: hero.inventory.loot + lootGain },
  };
  const events: WorldEvent[] = [{
    id: "day-" + day + ":" + hero.id + ":level6-combat",
    type: "level6-combat", combatOutcome: outcome, day, adventurerId: hero.id,
    message: hero.name + " faced the Cave Troll (Level 6 Boss, " + rounds + " rounds): " + outcome +
      ". HP " + hero.health + "→" + health + "; troll " + BOSS_HP + "→" + bossHealth +
      "; XP +" + xpGain + ", gold +" + goldGain + ", loot +" + lootGain + ".",
  }];
  if (outcome !== "death") events.push({
    id: "day-" + day + ":" + hero.id + ":level6-return",
    type: "level6-return",
    day, adventurerId: hero.id,
    message: hero.name + " is returning to the Level 5 shop.",
  });
  return { adventurer, events, rngState: rng.state, victory, actions };
}
