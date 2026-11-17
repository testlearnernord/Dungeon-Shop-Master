import assert from "node:assert/strict";
import test from "node:test";
import { nextBossTrainingScenario } from "../../src/game/bossTrainingScenario.ts";
import { createCombatPreview, stepCombatPreview } from "../../src/game/arenaCombatMotion.ts";

test("training variants differ on each restart and never mutate authoritative state",()=>{
  const a=nextBossTrainingScenario(()=>0);
  const b=nextBossTrainingScenario(()=>0);
  assert.notEqual(a.label,b.label);
  assert.notEqual(a.options.tacticsSeed,b.options.tacticsSeed);
  const first=createCombatPreview(a.options);
  const second=createCombatPreview(a.options);
  for(let i=0;i<480;i++){
    stepCombatPreview(first,1/60);
    stepCombatPreview(second,1/60);
  }
  assert.deepEqual(first,second,"a chosen scenario still uses deterministic motor ticks");
});

test("every training preset uses valid finite stats and safe start positions",()=>{
  for(let i=0;i<12;i++){
    const scenario=nextBossTrainingScenario(()=>i/12);
    const s=createCombatPreview(scenario.options);
    assert(s.heroHp>0);
    assert.equal(s.heroHp,scenario.options.maxHealth);
    assert.equal(s.hero.x,0);
    assert.equal(s.hero.z,-9);
    assert.equal(s.boss.z,2);
    assert(Number.isSafeInteger(scenario.options.tacticsSeed));
  }
});
