import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay, setLevel6Permit } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { simulateLevel6Combat } from "../../src/game/level6Combat.ts";
import { BOSS_MAX_HP } from "../../src/game/arenaCombatMotion.ts";
import { REPLAY_KEEP_RECENT, validateBossReplay } from "../../src/game/bossCombatReplay.ts";

function recordedFight() {
  let state = setLevel6Permit(createGameState(), "adventurer-1", true);
  state = advanceDay(state).state;
  return advanceDay(state).state;
}

test("the committed boss fight persists the actual spatial hits and positions", () => {
  const state = recordedFight();
  const event = state.events.find(e => e.type === "level6-combat")!;
  assert(event.combatReplay);
  assert.equal(event.combatReplay.outcome, event.combatOutcome);
  assert.equal(event.combatReplay.day, event.day);
  assert.equal(event.combatReplay.heroId, event.adventurerId);
  const frames = event.combatReplay.frames;
  assert.equal(frames[0].t, 0);
  assert.equal(frames[0].bossHp, BOSS_MAX_HP);
  const last = frames.at(-1)!;
  assert(last.t > 0);
  assert.equal(last.heroHp, state.adventurers.find(h => h.id === event.adventurerId)!.health);
  assert(last.bossHp >= 0 && last.bossHp <= BOSS_MAX_HP);
  assert(frames.some(f => f.travel > 2), "saved 3D hero must have physically moved");
  assert(frames.some(f => f.bx !== frames[0].bx || f.bz !== frames[0].bz),
    "recorded troll must pursue, not stand still");
  if (event.combatOutcome === "victory") assert.equal(last.bossHp, 0);
  if (event.combatOutcome === "death") assert.equal(last.heroHp, 0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))), state);
});

test("a seeded completed encounter is identical after save/load and cannot reroll when merely viewed", () => {
  let state = setLevel6Permit(createGameState(), "adventurer-1", true);
  state = advanceDay(state).state;
  const roundTrip = parseSave(JSON.stringify(createSave(state)));
  const a = advanceDay(state).state;
  const b = advanceDay(roundTrip).state;
  assert.deepEqual(a, b);
  const event = a.events.find(e => e.type === "level6-combat")!;
  const before = JSON.stringify(a);
  validateBossReplay(event.combatReplay,
    "event.combatReplay", event.adventurerId!, event.day, event.combatOutcome!);
  assert.equal(JSON.stringify(a), before, "replay validation/viewing never changes gameplay");
  const hero = roundTrip.adventurers.find(x=>x.id===event.adventurerId)!;
  assert.deepEqual(simulateLevel6Combat(hero,a.day,roundTrip.rngState),
    simulateLevel6Combat(hero,a.day,roundTrip.rngState));
});

test("rejects forged replay position, outcome, extra fields and invalid combat phases", () => {
  const game = recordedFight();
  const base = createSave(game);
  const tamper = (fn: (event:any)=>void) => {
    const save:any=structuredClone(base);
    const event=save.payload.events.find((e:any)=>e.type==="level6-combat");
    fn(event);
    assert.throws(()=>parseSave(JSON.stringify(save)),/combatReplay/);
  };
  tamper(e=>e.combatReplay.frames[0].hx=999);
  tamper(e=>e.combatReplay.outcome=e.combatOutcome==="death"?"victory":"death");
  tamper(e=>e.combatReplay.frames[1].heroPhase="dance");
  tamper(e=>e.combatReplay.frames[1].cues=[{kind:"spawn-gold"}]);
  tamper(e=>e.combatReplay.cheat=true);
  tamper(e=>e.combatReplay.frames.push(e.combatReplay.frames.at(-1)));
});

test("a victory replay requires a living hero", () => {
  const event = recordedFight().events.find(e => e.type === "level6-combat")!;
  const replay = structuredClone(event.combatReplay!);
  replay.outcome = "victory";
  replay.frames.at(-1)!.heroHp = 0;
  replay.frames.at(-1)!.bossHp = 0;
  assert.throws(() => validateBossReplay(replay, "replay", replay.heroId, replay.day, "victory"),
    /victory requires boss death and a living hero/);
});

test("only the three newest fight recordings remain heavy; full event outcomes remain intact", () => {
  const original = createGameState();
  const party = original.adventurers.slice(0,5).map(h=>({
    ...h, status:"expedition" as const, floor:6 as const,
    level6Permit:true, health: h.stats.maxHealth,
  }));
  const state = {
    ...original, adventurers: [...party,...original.adventurers.slice(5)],
  };
  const result = advanceDay(state).state;
  const combats=result.events.filter(e=>e.type==="level6-combat");
  assert.equal(combats.length,5);
  assert.equal(combats.filter(e=>e.combatReplay).length,REPLAY_KEEP_RECENT);
  assert(combats.slice(0,2).every(e=>!e.combatReplay));
  assert(combats.slice(-3).every(e=>e.combatReplay));
  assert.deepEqual(parseSave(JSON.stringify(createSave(result))),result);
});

test("old v7 combat events without recordings load and advance cleanly", () => {
  const state = recordedFight();
  const old:any=structuredClone(createSave(state));
  for (const event of old.payload.events) delete event.combatReplay;
  const loaded=parseSave(JSON.stringify(old));
  assert(loaded.events.some(e=>e.type==="level6-combat"&&!e.combatReplay));
  assert.deepEqual(advanceDay(loaded).state,advanceDay(parseSave(JSON.stringify(old))).state);
});
