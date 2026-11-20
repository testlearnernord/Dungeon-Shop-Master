import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {
  prepareLiveBossEncounter,LIVE_TROLL_ID,LIVE_TROLL_MAX_HP,
} from "../../src/game/liveBossEncounter.ts";
import {resolveGroupCombat,stepGroupCombat,createGroupCombat}
  from "../../src/game/groupCombat.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

function party(size:number):AdventurerState[]{
  return createGameState(7351).adventurers.slice(0,size).map(hero=>({
    ...hero,status:"expedition" as const,floor:6 as const,
  }));
}
test("unique cave Troll LIVE encounter reuses one authentic 60Hz group motor",()=>{
  const heroes=party(3);
  const options=prepareLiveBossEncounter(heroes);
  assert.equal(options.actors.length,4);
  assert.equal(options.actors.filter(a=>a.team==="monsters").length,1);
  assert.equal(options.actors.find(a=>a.id===LIVE_TROLL_ID)?.maxHp,
    LIVE_TROLL_MAX_HP);
  assert.deepEqual(prepareLiveBossEncounter(heroes),options);
  const actual=createGroupCombat(options);
  for(let i=0;i<30;i++)stepGroupCombat(actual);
  assert(Math.abs(actual.time-0.5)<1e-7);
  assert(actual.actors.some(a=>a.distanceTraveled>0));
  const first=resolveGroupCombat(options,30);
  const second=resolveGroupCombat(options,30);
  assert.deepEqual(first,second);
  assert.equal(first.replay.actors.length,4);
  assert(first.replay.frames.length>2);
});
test("boss refuses fake duplicates and is not mixed into the merchant state",()=>{
  const heroes=party(1),before=structuredClone(heroes);
  const opts=prepareLiveBossEncounter(heroes);
  assert.equal(opts.actors.length,2);
  assert.deepEqual(heroes,before);
  assert.throws(()=>prepareLiveBossEncounter([heroes[0],heroes[0]]),/distinct/);
  assert.throws(()=>prepareLiveBossEncounter([{
    ...heroes[0],floor:5,
  }]),/floor-6/);
});
