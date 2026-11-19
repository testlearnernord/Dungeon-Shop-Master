import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,DUNGEON_WORLD_EVENT_SUBJECT}
  from "../../src/game/liveDungeonRuntime.ts";
import {WORLD_TICKS_PER_DAY,lastWorldTickOfDay}
  from "../../src/game/worldClock.ts";

test("real world-clock event advances one dungeon step during shop play, not at bedtime",()=>{
  const store=new GameStore(createGameState(7351));
  const before=store.state;
  const initial=before.adventurers.filter(h=>h.status==="exploring");
  assert(initial.length>0);
  store.enableLiveDungeon();
  assert.equal(store.state.liveDungeon.enabled,true);
  assert.equal(store.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
  assert.equal(store.state.worldClock.pending[0].subjectId,DUNGEON_WORLD_EVENT_SUBJECT);
  const started=store.state;
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS-1);
  assert.deepEqual(store.state.adventurers,started.adventurers,
    "Dungeon must not move before its scheduled event.");
  assert.equal(store.state.liveDungeon.lastStepTick,0);
  store.advanceWorldTime(1);
  assert.equal(store.state.worldClock.tick,DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal(store.state.liveDungeon.lastStepTick,DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.heroes.length>0);
  assert(store.state.liveDungeon.heroes.every(h=>h.steps===1));
  assert(store.state.earlyDungeonWorlds?.some(e=>e.world.heroes.length>0));
  assert(store.state.adventurers.some((hero,i)=>
    hero!==initial[i]&&hero.status==="exploring")||
    store.state.earlyDungeonWorlds!.length>0);
  assert.equal(store.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
  assert.equal(SIMULATION_VERSION,18);
});

test("pending expedition event, true positions, HP and rewards resume deterministically from JSON",()=>{
  const a=new GameStore(createGameState(7351));
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2+75);
  const resumed=parseSave(JSON.stringify(createSave(a.state)));
  const b=new GameStore(resumed);
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2);
  b.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2);
  assert.deepEqual(a.state,b.state);
  const ids=a.state.events.map(e=>e.id);
  assert.equal(ids.length,new Set(ids).size,"Each live event must be unique.");
  assert.equal(a.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
});

test("sleep fast-forwards the SAME live scheduler and NEVER rolls a second dungeon day",()=>{
  const seed=7351;
  const direct=new GameStore(createGameState(seed));
  const paced=new GameStore(createGameState(seed));
  direct.enableLiveDungeon();
  paced.enableLiveDungeon();
  direct.endDay();
  paced.advanceWorldTime(lastWorldTickOfDay(1));
  paced.endDay();
  assert.deepEqual(direct.state,paced.state);
  assert.equal(direct.state.day,2);
  assert.equal(direct.state.worldClock.tick,WORLD_TICKS_PER_DAY);
  assert.equal(direct.state.liveDungeon.lastStepTick,WORLD_TICKS_PER_DAY);
  assert(direct.state.worldClock.pending.some(event=>
    event.lane==="expedition"&&event.dueTick===WORLD_TICKS_PER_DAY+
      DUNGEON_STEP_INTERVAL_TICKS));
  assert.deepEqual(parseSave(JSON.stringify(createSave(direct.state))),
    direct.state);
});

test("save validator refuses a second dungeon motor and forged pending/due ticks",()=>{
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  const valid=createSave(store.state);
  const tamper=(fn:(value:any)=>void,regex:RegExp)=>{
    const envelope=structuredClone(valid) as any;
    fn(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),regex);
  };
  tamper(s=>{s.liveDungeon.enabled=false;},/liveDungeon/);
  tamper(s=>{s.liveDungeon.lastStepTick=1;},/liveDungeon/);
  tamper(s=>{s.worldClock.pending.push(s.worldClock.pending[0]);},/pending/);
  tamper(s=>{s.worldClock.pending[0].subjectId="forged-world";},/liveDungeon/);
  tamper(s=>{s.worldClock.pending=[];},/liveDungeon/);
  tamper(s=>{s.liveDungeon.heroes=[{heroId:"ghost",steps:1,finished:false}];},/heroId/);
  assert.deepEqual(parseSave(JSON.stringify(valid)),store.state);
});
