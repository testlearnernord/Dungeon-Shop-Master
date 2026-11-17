import test from "node:test";
import assert from "node:assert/strict";
import {
  BOSS_MAX_HP, SAFE_HERO_RADIUS, WALKABLE_RADIUS,
  createCombatPreview, stepCombatPreview,
} from "../../src/game/arenaCombatMotion.ts";
import { resolveSpatialBoss, validateBossReplay } from "../../src/game/bossCombatReplay.ts";

const base={role:"tank" as const,sword:true,armor:true,
  health:55,maxHealth:55,healingSupplies:2};
const tick=(s:ReturnType<typeof createCombatPreview>,n=1)=>{
  const cues=[];for(let i=0;i<n;i++)cues.push(...stepCombatPreview(s,1/60));
  return cues;
};

test("navigation, rolls and chase never send fighters into lava",()=>{
  const s=createCombatPreview({...base,role:"DPS",sword:false});
  s.hero={x:SAFE_HERO_RADIUS-.05,z:0};
  s.boss={x:SAFE_HERO_RADIUS-3.5,z:0};
  s.bossPhase="windup";s.bossAge=.68;
  let lava=0;
  for(let i=0;i<90;i++){
    lava+=tick(s).filter(x=>x.kind==="lava").length;
    assert(Math.hypot(s.hero.x,s.hero.z)<=SAFE_HERO_RADIUS+1e-8,
      "physical avoidance stays within safe rock floor");
    if(s.outcome!=="fighting")break;
  }
  assert.equal(lava,0,"a normal AI dodge should never become a lava death");
  assert(Math.hypot(s.boss.x,s.boss.z)<WALKABLE_RADIUS);
});

test("slammed toward lava takes actual limited edge damage without a one-hit kill",()=>{
  const s=createCombatPreview(base);
  s.boss={x:11.4,z:0};
  s.hero={x:14.6,z:0};
  s.bossPhase="strike";s.bossAge=.13;s.bossSlam=true;
  s.lockedBossHeading=Math.PI/2;
  const cues=tick(s);
  assert.equal(s.outcome,"fighting");
  assert(cues.some(c=>c.kind==="hit"&&c.amount===9));
  assert(cues.some(c=>c.kind==="lava"&&c.amount===12));
  assert.equal(s.heroHp,34);
  assert(Math.hypot(s.hero.x,s.hero.z)<=SAFE_HERO_RADIUS+1e-8);
});

test("lava is lethal only if the remaining real HP is exhausted",()=>{
  const s=createCombatPreview({...base,health:8,maxHealth:55});
  s.hero={x:WALKABLE_RADIUS+0.6,z:0};
  const cues=tick(s);
  assert.equal(s.heroHp,0);
  assert.equal(s.outcome,"defeat");
  assert(cues.some(c=>c.kind==="lava"&&c.amount===8));
});

test("multi-role seeded new duels are deterministic, bounded and produce real replay cues",()=>{
  const scenarios=[
    {role:"tank" as const,sword:true,armor:true,health:58,maxHealth:58,healingSupplies:2},
    {role:"DPS" as const,sword:true,armor:true,health:55,maxHealth:55,healingSupplies:2},
    {role:"DPS" as const,sword:false,armor:false,health:50,maxHealth:50,healingSupplies:2},
    {role:"healer" as const,sword:false,armor:false,health:44,maxHealth:44,healingSupplies:2},
  ];
  let sampled=0,totalSeconds=0,lavaDeaths=0,short=0;
  for(const options of scenarios)for(const seed of [0,1,3,7,11,19]){
    const args={...options,tacticsSeed:seed};
    const a=resolveSpatialBoss("hero",1,args);
    const b=resolveSpatialBoss("hero",1,args);
    assert.deepEqual(a,b,"identical inputs must keep exact outcomes and frame cues");
    validateBossReplay(a.replay,"replay","hero",1,a.replay.outcome);
    const seconds=a.replay.frames.at(-1)!.t;
    assert(seconds>0&&seconds<=90);
    assert.equal(a.replay.frames[0].bossHp,BOSS_MAX_HP);
    if(seconds<18)short++;
    if(a.replay.outcome==="death"&&
      a.replay.frames.at(-1)!.cues.some(c=>c.kind==="lava"))lavaDeaths++;
    for(const frame of a.replay.frames)for(const cue of frame.cues){
      if(cue.kind==="lava")assert((cue.amount??0)<=12);
    }
    totalSeconds+=seconds;sampled++;
  }
  // Diagnostic headline is deliberately retained to guide further tuning.
  console.log("Level 6 sampled pacing:",{
    scenarios:sampled,averageSeconds:Number((totalSeconds/sampled).toFixed(1)),
    shortUnder18:short,lavaFinishes:lavaDeaths});
  assert.equal(lavaDeaths,0,"AI must not repeatedly suicide via the lava boundary");
  assert(totalSeconds/sampled>18,"the actual duel must allow music to develop");
});
