import assert from "node:assert/strict";
import test from "node:test";
import {frameFromCombat,resolveSpatialBoss,validateBossReplay}
  from "../../src/game/bossCombatReplay.ts";
import {createCombatPreview} from "../../src/game/arenaCombatMotion.ts";

test("training-only spatial tape is deterministic, valid and never commits a campaign boss",()=>{
  const options={role:"tank" as const,sword:true,armor:true,
    health:60,maxHealth:60,healingSupplies:0,tacticsSeed:7};
  const first=resolveSpatialBoss("training-hero",2,options);
  const repeated=resolveSpatialBoss("training-hero",2,options);
  assert.deepEqual(first.replay,repeated.replay);
  assert(first.replay.frames.length>1);
  assert.doesNotThrow(()=>validateBossReplay(first.replay,
    "trainingReplay","training-hero",2,first.replay.outcome));
  const forged=structuredClone(first.replay);
  (forged.frames[0] as {hx:number}).hx=999;
  assert.throws(()=>validateBossReplay(forged,
    "trainingReplay","training-hero",2,first.replay.outcome),/trainingReplay/);
});

test("new replay frames never store negative zero that JSON silently changes",()=>{
  const state=createCombatPreview({
    role:"tank",sword:true,armor:true,
    health:60,maxHealth:60,healingSupplies:0,
  });
  state.heroHeading=-0;
  state.bossHeading=-0;
  state.hero.x=-0.000001;
  const frame=frameFromCombat(state);
  assert.equal(Object.is(frame.hh,-0),false);
  assert.equal(Object.is(frame.bh,-0),false);
  assert.equal(Object.is(frame.hx,-0),false);
  assert.deepEqual(JSON.parse(JSON.stringify(frame)),frame);
});
