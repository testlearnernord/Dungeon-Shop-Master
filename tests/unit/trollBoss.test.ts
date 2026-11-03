import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, setLevel6Permit } from "../../src/game/gameState.ts";
import { simulateLevel6Combat } from "../../src/game/level6Combat.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

function expedition() {
  const original = createGameState().adventurers[0];
  return { ...original, status: "expedition" as const, floor: 6 as const, level6Permit: true };
}

test("Level 6 is always the same fixed Cave Troll Boss, with deterministic action timeline", () => {
  const hero = expedition();
  const a = simulateLevel6Combat(hero, 3, 42);
  const b = simulateLevel6Combat(hero, 3, 42);
  assert.deepEqual(a, b);
  assert(a.events[0].message.includes("Cave Troll"));
  assert(a.actions.some(action => action.kind === "windup"));
  assert(a.actions.some(action => action.kind === "attack"));
  assert.equal(a.events.filter(e => e.type === "level6-combat").length, 1);
  assert.notEqual(a.adventurer.status, "expedition");
  assert.deepEqual(hero, expedition());
  assert(a.actions.every(action => action.bossHp >= 0 && action.heroHp >= 0));
  assert(a.actions.some(action => action.actor === "troll"));
});

test("an overpowered, equipped adventurer can defeat the boss and unlock floor 6 exactly once", () => {
  const h = expedition();
  const champion = { ...h, health: 100,
    stats: { ...h.stats, strength: 75, agility: 40, maxHealth: 100 },
    equipment: { weapon: "Iron Sword", armor: "Leather Vest" },
  };
  const victory = simulateLevel6Combat(champion, 2, 123);
  assert.equal(victory.victory, true);
  assert.equal(victory.events[0].combatOutcome, "victory");
  assert(victory.actions.some(x => x.kind === "finish"));
  assert(victory.adventurer.gold > champion.gold);
  assert(victory.adventurer.inventory.loot >= champion.inventory.loot + 2);
  const game = createGameState();
  const prepared = { ...game, adventurers: game.adventurers.map(x => x.id === champion.id ? champion : x) };
  const clear = advanceDay(prepared).state;
  assert.equal(clear.dungeonFloors.filter(x => x.floor === 6 && x.cleared).length, 1);
  assert.equal(clear.events.filter(x => x.type === "level6-combat" && x.adventurerId === champion.id).length, 1);
});

test("weak unarmed solo runs are dangerous; equipment changes outcomes substantially", () => {
  const base = expedition();
  const recruit = { ...base, health: 45, stats: { ...base.stats, maxHealth: 45 },
    equipment: { weapon: null, armor: null }, inventory: { ...base.inventory, healing: 0 } };
  const geared = { ...recruit, equipment: { weapon: "Iron Sword", armor: "Leather Vest" } };
  let doomed = 0, survivedGeared = 0;
  for (let seed = 0; seed < 90; seed++) {
    const randomState = Math.imul(seed + 1, 0x9e3779b9) >>> 0;
    const weak = simulateLevel6Combat(recruit, 3, randomState);
    const strong = simulateLevel6Combat(geared, 3, randomState);
    if (weak.adventurer.status === "dead") doomed++;
    if (strong.adventurer.status !== "dead") survivedGeared++;
  }
  assert(doomed > 50, "unequipped solo heroes should usually die");
  assert(survivedGeared > 0, "equipment must offer a real survival chance");
});

test("healer can self-heal and attack at range, tank can parry, DPS can dodge", () => {
  const original = expedition();
  const healer = { ...original, role: "healer" as const, health: 20,
    stats: { ...original.stats, maxHealth: 60, intellect: 25 },
    inventory: { ...original.inventory, healing: 1 } };
  const heal = simulateLevel6Combat(healer, 3, 99);
  assert(heal.actions.some(x => x.kind === "heal"));
  assert(heal.actions.some(x => x.kind === "ranged"));
  assert(heal.adventurer.inventory.healing <= healer.inventory.healing);
  const healerWithSword = { ...healer, equipment: { weapon: "Iron Sword", armor: null } };
  const unarmedHealerHit = heal.actions.find(x => x.kind === "ranged" && x.damage !== undefined)!;
  const armedHealerHit = simulateLevel6Combat(healerWithSword, 3, 99).actions
    .find(x => x.kind === "ranged" && x.damage !== undefined)!;
  assert.equal(armedHealerHit.damage, unarmedHealerHit.damage! + 4);
  const tank = { ...original, role: "tank" as const, equipment: { weapon: "Iron Sword", armor: "Leather Vest" } };
  // A melee DPS must dodge when the club actually enters range; an unarmed
  // ranged DPS may sensibly kite instead of rolling under the troll.
  const dps = { ...original, role: "DPS" as const,
    equipment: { weapon: "Iron Sword", armor: null } };
  const tankActions = Array.from({length: 30},(_,seed)=>simulateLevel6Combat(tank,3,seed).actions).flat();
  const dpsActions = Array.from({length: 30},(_,seed)=>simulateLevel6Combat(dps,3,seed).actions).flat();
  assert(tankActions.some(x=>x.kind==="parry"));
  assert(dpsActions.some(x=>x.kind==="dodge"));
  assert(tankActions.filter(x=>x.kind==="smash").every(x=>x.actor==="troll"));
  assert(tankActions.filter(x=>x.kind==="block").every(x=>x.actor==="hero"));
  const unarmedDpsActions = Array.from({length: 30}, (_, seed) =>
    simulateLevel6Combat({ ...original, role: "DPS" as const,
      equipment: { weapon: null, armor: null } }, 3, seed).actions).flat();
  assert(unarmedDpsActions.some(x => x.kind === "ranged" && x.damage !== undefined));

  const lethalParryTank = { ...tank, stats: { ...tank.stats, strength: 1 } };
  const lethalParry = simulateLevel6Combat(lethalParryTank, 3, 7);
  assert.equal(lethalParry.actions.at(-1)?.kind, "finish");
  assert.equal(lethalParry.actions.at(-1)?.actor, "hero");
});

test("boss fights still obey single confirmed tick and legacy save compatibility", () => {
  let state = setLevel6Permit(createGameState(), "adventurer-1", true);
  state = advanceDay(state).state;
  const pending = parseSave(JSON.stringify(createSave(state)));
  const result = advanceDay(state).state;
  assert.deepEqual(advanceDay(pending).state, result);
  assert.deepEqual(parseSave(JSON.stringify(createSave(result))), result);
  assert.equal(result.events.filter(x => x.day === 3 && x.type === "level6-combat" && x.adventurerId === "adventurer-1").length, 1);
  assert(result.adventurers.every(x=>x.floor<=6));
});
