import test from "node:test";
import assert from "node:assert/strict";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
import {measureCombatHorizons,addHorizonSummary} from "./combat-horizon-audit.mjs";

const fighter=(id,team,x)=>({id,team,role:team==="heroes"?"DPS":"monster",
  style:"melee",x,z:0,hp:100,maxHp:100,damage:8,armor:2,speed:3,reach:2});
const options={bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},
  actors:[fighter("hero","heroes",-3),fighter("monster","monsters",3)]};

test("diagnostic cutoff matches production motor health, outcome and actual elapsed time",()=>{
  const source=structuredClone(options);
  const measured=measureCombatHorizons(options,[35,90,240]);
  const normal=resolveGroupCombat(options,35);
  const first=measured[0];
  assert.equal(first.outcome==="fighting"?"draw":first.outcome,normal.state.outcome);
  assert.equal(first.heroHp,normal.state.actors.find(a=>a.team==="heroes").hp);
  assert.equal(first.monsterHp,normal.state.actors.find(a=>a.team==="monsters").hp);
  assert(Math.abs(first.elapsed-normal.state.time)<1e-6);
  assert.deepEqual(options,source);
  assert(measured.every((r,i)=>i===0||r.elapsed>=measured[i-1].elapsed));
});

test("no damage or movement does not invent a natural winner or settlement",()=>{
  const staticFight={...options,actors:options.actors.map(a=>({...a,speed:0,reach:1}))};
  const snapshots=measureCombatHorizons(staticFight,[35,90,240]);
  assert(snapshots.every(r=>r.outcome==="fighting"&&r.heroDeaths===0&&r.heroHp===100&&r.monsterHp===100));
  assert.equal(snapshots[2].secondsWithoutDamage,240);
  const summary={};
  addHorizonSummary(summary,"static",snapshots);
  assert.equal(summary["static:240"].active,1);
  assert.equal(summary["static:240"].noDamage30,1);
  assert.equal(summary["static:240"].wins,0);
  assert.throws(()=>measureCombatHorizons(staticFight,[90,35]),/horizons/);
});
