import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {caveTrollActor,caveTrollPartyOptions,CAVE_TROLL_LIVE_PROFILE} from "../../src/game/sharedBossCombat.ts";
import {buildDeveloperCombat,DEFAULT_DEVELOPER_CONFIG} from "../../src/game/developerCombatScenario.ts";
import {createGroupCombat,stepGroupCombat,resolveGroupCombat} from "../../src/game/groupCombat.ts";

test("Lab and LIVE party encounters use the same canonical Troll profile",()=>{
  const live=caveTrollPartyOptions(createGameState(7351).adventurers.slice(0,2)
    .map(h=>({...h})),17);
  const lab=buildDeveloperCombat(DEFAULT_DEVELOPER_CONFIG);
  const {id,x,z,...labStats}=lab.actors.find(a=>a.team==="monsters")!;
  const {id:liveId,x:liveX,z:liveZ,...liveStats}=live.actors.find(a=>a.team==="monsters")!;
  assert.deepEqual(labStats,liveStats);
  assert.equal(liveStats.hp,CAVE_TROLL_LIVE_PROFILE.hp);
  assert.equal(caveTrollActor().id,liveId);
  assert.notEqual(id,liveId);
});
test("canonical Troll encounters are deterministic in the actual group motor",()=>{
  const options=buildDeveloperCombat(DEFAULT_DEVELOPER_CONFIG);
  const first=resolveGroupCombat(options,90),second=resolveGroupCombat(options,90);
  assert.deepEqual(first,second);
  assert(first.replay.cues.some(c=>c.kind==="attack"&&c.actorId==="lab-cave-troll"));
  assert(first.replay.frames.length>1);
});
test("seeded tanks retain physical parries and dodges against committed Troll strikes",()=>{
  let parries=0,dodges=0;
  for(let seed=0;seed<32;seed++){
    const opts=buildDeveloperCombat({...DEFAULT_DEVELOPER_CONFIG,seed});
    const state=createGroupCombat(opts);
    const boss=state.actors.find(a=>a.team==="monsters")!,tank=state.actors.find(a=>a.team==="heroes")!;
    boss.phase="windup";boss.activeMeleeAbility="troll-smash";boss.phaseAge=.76;
    boss.lockedHeading=Math.PI;boss.heading=Math.PI;boss.targetId=tank.id;boss.attacksStarted=2;
    tank.x=0;tank.z=0;boss.x=0;boss.z=3;
    for(let tick=0;tick<30;tick++)stepGroupCombat(state);
    if(state.events.some(e=>e.kind==="parry"&&e.actorId===tank.id))parries++;
    if(state.events.some(e=>e.kind==="dodge"&&e.actorId===tank.id))dodges++;
  }
  assert(parries>0);assert(dodges>0);
});
