import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_STEP_SECONDS, encounterTeamOutcome, recordCombatEncounter,
  stepCombatEncounter, type EncounterPipeline,
} from "../../src/game/combatEncounter.ts";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat,
} from "../../src/game/groupCombat.ts";

test("one group-capable encounter driver owns real tick and phase order",()=>{
  const state={time:0,outcome:"fighting",calls:[] as string[],journal:[] as string[]};
  const pipeline:EncounterPipeline<typeof state,string,string>={
    beforeActors:(s,dt,frame)=>{
      assert.equal(s.time,dt,"one authoritative clock advance");
      s.calls.push("before");frame.cues.push("before");
    },
    actors:()=>["hero","troll","companion"],
    updateActor:(s,id,_,frame)=>{
      s.calls.push(id);frame.cues.push(id);
    },
    projectiles:(s,_,frame)=>{
      s.calls.push("projectiles");frame.cues.push("projectiles");
    },
    finish:(s,_,frame)=>{
      s.calls.push("finish");frame.cues.push("finish");
      s.outcome="heroes";
    },
    commit:(s,frame)=>{
      s.calls.push("commit");s.journal.push(...frame.cues);
    },
  };
  const result=stepCombatEncounter(state,COMBAT_STEP_SECONDS,pipeline);
  const order=["before","hero","troll","companion","projectiles","finish","commit"];
  assert.deepEqual(state.calls,order);
  assert.deepEqual(result,order.slice(0,-1));
  assert.deepEqual(state.journal,result);
  assert.equal(state.time,COMBAT_STEP_SECONDS);
  assert.deepEqual(stepCombatEncounter(state,COMBAT_STEP_SECONDS,pipeline),[]);
  assert.equal(state.time,COMBAT_STEP_SECONDS,"finished encounters do not advance time");
  assert.deepEqual(state.calls,order,"a completed encounter cannot execute again");
  assert.throws(()=>stepCombatEncounter(state,NaN,pipeline),RangeError);
  assert.throws(()=>stepCombatEncounter(state,0,pipeline),RangeError);
});

test("winner selection is identical for a boss pair and ordinary actor groups",()=>{
  const h={team:"heroes" as const,hp:15};
  const m={team:"monsters" as const,hp:25};
  assert.equal(encounterTeamOutcome([h,m]),"fighting");
  assert.equal(encounterTeamOutcome([{...h,hp:0},m]),"monsters");
  assert.equal(encounterTeamOutcome([h,{...m,hp:0}]),"heroes");
  assert.equal(encounterTeamOutcome([{...h,hp:0},{...m,hp:0}]),"draw");
  assert.equal(encounterTeamOutcome([h,{...h,hp:0},m]),"fighting");
  assert.throws(()=>encounterTeamOutcome([]),RangeError);
});

test("the single recorder preserves initial capture, exact 60Hz ticks and pending cue order",()=>{
  const state={time:0,outcome:"fighting",value:0};
  const recorded=recordCombatEncounter({
    state,maxSeconds:3,captureEvery:8,
    isFighting:world=>world.outcome==="fighting",
    step:(world,dt)=>{
      world.time+=dt;world.value++;
      if(world.value===17)world.outcome="heroes";
      return [world.value];
    },
    capture:(world,cues)=>({
      ticks:world.value,events:[...cues],
    }),
  });
  assert.equal(recorded.state.value,17);
  assert.deepEqual(recorded.frames.map(frame=>frame.ticks),[0,8,16,17]);
  assert.deepEqual(recorded.frames[0].events,[]);
  assert.deepEqual(recorded.frames[1].events,[1,2,3,4,5,6,7,8]);
  assert.deepEqual(recorded.frames[2].events,[9,10,11,12,13,14,15,16]);
  assert.deepEqual(recorded.frames[3].events,[17]);
  assert.throws(()=>recordCombatEncounter({
    ...{state},maxSeconds:91,captureEvery:8,
    isFighting:()=>true,step:()=>[],capture:()=>0,
  }),RangeError);
});

const duel={
  bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
  actors:[
    {id:"hero",team:"heroes" as const,role:"tank" as const,
      style:"melee" as const,x:-3,z:0,hp:90,maxHp:90,
      damage:13,armor:4,speed:3,reach:1.7,healCharges:1},
    {id:"enemy",team:"monsters" as const,role:"monster" as const,
      style:"melee" as const,x:3,z:0,hp:70,maxHp:70,
      damage:8,armor:2,speed:2.8,reach:1.7,meleeAbility:"heavy" as const},
  ],
};

test("real ordinary group combat uses the same 60Hz driver without changing replay v1",()=>{
  const a=resolveGroupCombat(duel,15);
  const b=resolveGroupCombat(duel,15);
  assert.deepEqual(a,b);
  assert.equal(a.replay.version,1);
  assert.equal(a.replay.frames[0].t,0);
  assert(a.replay.frames.length>2);
  assert(a.replay.frames.every(frame=>frame.actors.length===2));
  assert.deepEqual(a.replay.cues,a.state.events);
  const manual=createGroupCombat(duel);
  while(manual.outcome==="fighting"&&manual.time<15-0.0001)
    stepGroupCombat(manual,COMBAT_STEP_SECONDS);
  if(manual.outcome==="fighting")manual.outcome="draw";
  assert.deepEqual(a.state,manual);
});
