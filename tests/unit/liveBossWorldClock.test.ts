import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";
import {liveBossCheckpointProblem} from "../../src/game/liveBossSave.ts";

function campaignWithBoss(){
  const seed=7351,initial=createGameState(seed);
  const first=initial.adventurers[0];
  const roster=initial.adventurers.map(hero=>hero.id===first.id
    ?{...hero,status:"expedition" as const,floor:6 as const,
      level6Permit:true,health:hero.stats.maxHealth}:hero);
  return {id:first.id,store:new GameStore({...initial,adventurers:roster})};
}

test("Floor-6 encounter starts on one real dungeon tick with no instantly resolved Troll replay",()=>{
  const {store,id}=campaignWithBoss();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const boss=store.state.liveDungeon.bossCombat;
  assert(boss);
  assert.equal(boss.heroId,id);
  assert.equal(boss.state.time,0);
  assert.equal(boss.frames.length,1);
  assert.equal(boss.frames[0].t,0);
  assert.equal(boss.state.outcome,"fighting");
  assert.equal(boss.state.bossHp,280);
  assert.equal(store.state.events.some(event=>event.type==="level6-combat"),false);
  assert(store.state.worldClock.pending.some(event=>
    event.lane==="expedition"&&event.subjectId==="dungeon-combat"));
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("real Cave Troll 60Hz action frames resume deterministically and never double-settle",()=>{
  const {store:a,id}=campaignWithBoss();
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  a.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS*3);
  const boss=a.state.liveDungeon.bossCombat;
  assert(boss);
  assert.equal(boss.state.time>0,true);
  assert(Math.abs(boss.state.time-1.5)<.001);
  assert.equal(boss.frames.length,1+Math.floor(90/8));
  assert.equal(liveBossCheckpointProblem(a.state,boss,
    a.state.liveDungeon.combatTick,a.state.liveDungeon.lastStepTick),null);
  const loaded=parseSave(JSON.stringify(createSave(a.state)));
  const b=new GameStore(loaded);
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(2500);
  b.advanceWorldTime(2500);
  assert.deepEqual(a.state,b.state,"Reload must preserve all future unique Troll outcomes");
  const finished=a.state.events.filter(e=>e.type==="level6-combat"&&e.adventurerId===id);
  assert.equal(finished.length,1,"No second boss fight or duplicated loot settlement");
  assert.equal(finished[0].combatReplay?.version,1);
  assert((finished[0].combatReplay?.frames.length??0)>2);
  assert.equal(a.state.liveDungeon.bossCombat,null);
  assert.deepEqual(parseSave(JSON.stringify(createSave(a.state))),a.state);
});

test("boss save rejects fake HP, phase, clock, snapshots and actor identity",()=>{
  const {store}=campaignWithBoss();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS+LIVE_COMBAT_INTERVAL_TICKS*2);
  const state=store.state;
  assert(state.liveDungeon.bossCombat);
  const original=createSave(state);
  const tamper=(fn:(s:any)=>void,pattern:RegExp)=>{
    const changed=structuredClone(original) as any;
    fn(changed.payload);
    assert.throws(()=>parseSave(JSON.stringify(changed)),pattern);
  };
  tamper(s=>{s.liveDungeon.bossCombat.state.heroHp=99999;},/bossCombat/);
  tamper(s=>{s.liveDungeon.bossCombat.state.bossPhase="fake";},/bossCombat/);
  tamper(s=>{s.liveDungeon.bossCombat.state.time+=1;},/bossCombat/);
  tamper(s=>{s.liveDungeon.bossCombat.frames[0].heroHp-=1;},/bossCombat/);
  tamper(s=>{s.liveDungeon.bossCombat.heroId="ghost";},/bossCombat/);
  assert.deepEqual(parseSave(JSON.stringify(original)),state);
});

test("two concurrent Floor-6 explorers cannot spawn duplicate live Troll combats",()=>{
  const initial=createGameState(7351);
  const [first,second]=initial.adventurers;
  const contestants=new Set([first.id,second.id]);
  const adventurers=initial.adventurers.map(hero=>contestants.has(hero.id)
    ?{...hero,status:"expedition" as const,floor:6 as const,
      level6Permit:true,health:hero.stats.maxHealth}:hero);
  const store=new GameStore({...initial,adventurers});
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const boss=store.state.liveDungeon.bossCombat;
  assert(boss,"Only the real saved Cave Troll motor can own Floor 6");
  assert.equal(boss.heroId,first.id,"Roster order must choose a stable boss challenger");
  assert.equal(boss.state.bossHp,280);
  assert.equal(boss.state.outcome,"fighting");
  assert.equal(store.state.liveDungeon.combats.length,0,
    "A second challenger must not create a parallel group boss or dummy fight");
  assert.equal(store.state.worldClock.pending.filter(e=>
    e.lane==="expedition"&&e.subjectId==="dungeon-combat").length,1,
    "One world clock event owns all ongoing real fights");
  assert.equal(store.state.events.filter(e=>e.type==="level6-combat").length,0);
  assert.equal(store.state.adventurers.find(h=>h.id===second.id)?.health,
    second.stats.maxHealth,"Spectator or arbitration must not damage other heroes");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  assert.equal(store.state.liveDungeon.bossCombat?.heroId,first.id);
  assert(store.state.liveDungeon.bossCombat!.state.time>0,
    "The only boss has advanced by an actual scheduled 60Hz motor batch");
});
