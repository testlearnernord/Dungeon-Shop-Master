import assert from "node:assert/strict";
import {test} from "node:test";
import {
  caveTrollGroupOptions,createSharedBossPreview,stepSharedBossPreview,
} from "../../src/game/sharedBossCombat.ts";
import {
  createGroupCombat,stepGroupCombat,
} from "../../src/game/groupCombat.ts";
import {frameFromCombat} from "../../src/game/bossCombatReplay.ts";

const options={
  role:"tank" as const,sword:true,armor:true,
  health:120,maxHealth:120,healingSupplies:2,
  strength:20,agility:12,intellect:8,tacticsSeed:17,
};

test("Floor-6 boss and group combat use exactly the same 60Hz authority",()=>{
  const level6=createSharedBossPreview(options);
  const group=createGroupCombat(caveTrollGroupOptions(options));
  const initial=frameFromCombat(level6);
  assert.equal(initial.heroHp,120);
  assert.equal(initial.bossHp,280);
  for(let i=0;i<420;i++){
    stepSharedBossPreview(level6,1/60);
    stepGroupCombat(group,1/60);
    assert.deepEqual(level6.group,group,
      "the solo cinematic must NEVER reroll or step a second engine");
    const hero=group.actors.find(a=>a.id==="hero")!;
    const boss=group.actors.find(a=>a.id==="cave-troll")!;
    assert.equal(level6.heroHp,hero.hp);
    assert.equal(level6.bossHp,boss.hp);
    assert.equal(level6.time,group.time);
    if(level6.outcome!=="fighting")break;
  }
  assert(level6.group.events.length>0,
    "one real motor produces inspectable tactical actions");
});

test("same seed and gear give identical new boss saves and replay projections",()=>{
  const a=createSharedBossPreview(options);
  const b=createSharedBossPreview(options);
  for(let i=0;i<360;i++){
    assert.deepEqual(stepSharedBossPreview(a),stepSharedBossPreview(b));
    assert.deepEqual(frameFromCombat(a),frameFromCombat(b));
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
});

test("a sword-bearing tank can parry a committed Troll strike before its contact tick",()=>{
  const state=createGroupCombat(caveTrollGroupOptions(options));
  const boss=state.actors.find(actor=>actor.id==="cave-troll")!;
  const tank=state.actors.find(actor=>actor.id==="hero")!;
  boss.phase="windup";
  boss.activeMeleeAbility="troll-smash";
  boss.phaseAge=.70;
  boss.lockedHeading=Math.PI;
  boss.heading=Math.PI;
  boss.targetId=tank.id;
  boss.attacksStarted=2;
  // Fixed-position bench: the hero is close enough for actual contact.
  tank.x=0;tank.z=0;
  boss.x=0;boss.z=3;
  let defended=false;
  for(let tick=0;tick<60&&!defended;tick++){
    stepGroupCombat(state);
    defended=state.events.some(e=>e.kind==="parry"&&
      e.actorId==="hero"&&e.targetId==="cave-troll");
  }
  assert(defended,"Parry's 0.10–0.36s window must overlap Troll contact");
  assert.equal(tank.hp,options.health,
    "a genuine timed parry must prevent boss strike damage");
});
