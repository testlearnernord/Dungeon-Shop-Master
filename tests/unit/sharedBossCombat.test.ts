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

test("seeded sword tanks can physically parry and dodge committed Troll strikes",()=>{
  let parries=0,dodges=0;
  for(let seed=0;seed<32;seed++){
    const state=createGroupCombat(caveTrollGroupOptions({...options,tacticsSeed:seed}));
    const boss=state.actors.find(actor=>actor.id==="cave-troll")!;
    const tank=state.actors.find(actor=>actor.id==="hero")!;
    boss.phase="windup";
    boss.activeMeleeAbility="troll-smash";
    boss.phaseAge=.70;
    boss.lockedHeading=Math.PI;
    boss.heading=Math.PI;
    boss.targetId=tank.id;
    boss.attacksStarted=2;
    tank.x=0;tank.z=0;
    boss.x=0;boss.z=3;
    for(let tick=0;tick<60;tick++)stepGroupCombat(state);
    const blocked=state.events.some(e=>e.kind==="parry"&&
      e.actorId==="hero"&&e.targetId==="cave-troll");
    const rolled=state.events.some(e=>e.kind==="dodge"&&
      e.actorId==="hero"&&e.targetId==="cave-troll");
    if(blocked||rolled){
      assert.equal(tank.hp,options.health,
        "an authentic timed defense must prevent boss strike damage");
    }
    if(blocked)parries++;
    if(rolled)dodges++;
  }
  assert(parries>0,"parry's committed contact window must genuinely overlap a Troll strike");
  assert(dodges>0,"tanks remain capable of rolling rather than always parrying");
});

test("diagnostics: seeded Troll grab opportunities and physical strike outcomes",()=>{
  const fight={...options,role:"DPS" as const,health:185,maxHealth:185,
    healingSupplies:2};
  let grabEncounters=0,throwEncounters=0;
  let smashHits=0,grappleAttempts=0,late=0;
  const examples:unknown[]=[];
  for(let seed=0;seed<48;seed++){
    const s=createSharedBossPreview({...fight,tacticsSeed:seed});
    let sawGrab=false,sawThrow=false;
    let firstGrabGap:number|null=null;
    let bossAttacks=0,heroHits=0;
    for(let tick=0;tick<5400&&s.outcome==="fighting";tick++){
      stepSharedBossPreview(s,1/60);
      const boss=s.group.actors.find(a=>a.id==="cave-troll")!;
      const hero=s.group.actors.find(a=>a.id==="hero")!;
      if(boss.phase==="grab"){
        if(!sawGrab)firstGrabGap=Math.hypot(boss.x-hero.x,boss.z-hero.z);
        sawGrab=true;
      }
      if(boss.phase==="throw")sawThrow=true;
    }
    bossAttacks=s.group.events.filter(e=>e.kind==="attack"&&e.actorId==="cave-troll").length;
    heroHits=s.group.events.filter(e=>e.kind==="hit"&&e.actorId==="cave-troll").length;
    smashHits+=heroHits;
    grappleAttempts+=bossAttacks;
    if(sawGrab)grabEncounters++;
    if(sawThrow)throwEncounters++;
    if(s.time>18)late++;
    if(seed<5)examples.push({seed,time:Number(s.time.toFixed(1)),bossAttacks,heroHits,
      firstGrabGap,sawGrab,sawThrow,heroHp:s.heroHp});
  }
  console.log("Shared-Troll-telegraph-diagnostics",{
    grabEncounters,throwEncounters,smashHits,grappleAttempts,late,examples});
});
