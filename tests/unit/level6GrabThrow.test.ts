import assert from "node:assert/strict";
import test from "node:test";
import {
  WALKABLE_RADIUS, createCombatPreview, stepCombatPreview,
  type CombatPreviewOptions, type CombatPreviewState, type ArenaCue,
} from "../../src/game/arenaCombatMotion.ts";
import {frameFromCombat, resolveSpatialBoss, validateBossReplay} from "../../src/game/bossCombatReplay.ts";

const base:CombatPreviewOptions={
  role:"tank",sword:true,armor:true,agility:10,
  health:120,maxHealth:120,healingSupplies:1,
};
function poised(seed:number, rim=false):CombatPreviewState {
  const s=createCombatPreview({...base,tacticsSeed:seed});
  s.boss=rim?{x:12,z:0}:{x:0,z:0};
  s.hero=rim?{x:15,z:0}:{x:0,z:3};
  s.bossHeading=rim?Math.PI/2:0;
  s.lockedBossHeading=s.bossHeading;
  s.bossPhase="grab"; s.bossAge=.13; s.bossAttacks=3;
  s.bossAttack="grab"; s.bossSlam=false;
  s.bossDamageApplied=false; s.heroCooldown=99;
  return s;
}
const tick=(s:CombatPreviewState)=>stepCombatPreview(s,1/60);
function caught(rim=false):CombatPreviewState {
  for(let seed=0;seed<128;seed++){
    const s=poised(seed,rim);
    if(tick(s).some(c=>c.kind==="grab"))return s;
  }
  throw Error("No viable grapple found across deterministic tactics seeds");
}

test("grapple is not a scripted cutscene: reach, roll, sword parry, and grip breaks matter",()=>{
  const far=poised(3);
  far.hero.z=8;
  assert(tick(far).some(c=>c.kind==="miss"));
  assert.notEqual(far.heroPhase,"grabbed");

  const dodge=poised(3);
  dodge.heroPhase="roll";dodge.heroAge=.18;dodge.rollDirection={x:1,z:0};
  assert(tick(dodge).some(c=>c.kind==="dodge"));
  assert.equal(dodge.heroHp,120);
  assert.equal(dodge.dodgeCount,1);
  assert.equal(dodge.bossPhase,"recover");

  const parry=poised(3);
  parry.heroPhase="parry";parry.heroAge=.18;
  assert(tick(parry).some(c=>c.kind==="parry"));
  assert.equal(parry.bossPhase,"stagger");
  assert(parry.bossHp<280);

  let escaped=0,captured=0;
  for(let seed=0;seed<128;seed++){
    const s=poised(seed);
    const cues=tick(s);
    if(cues.some(c=>c.kind==="grab"))captured++;
    else if(cues.some(c=>c.kind==="miss"))escaped++;
  }
  assert(captured>0 && escaped>0,"grip break and successful grab are both real");
});

test("successful grab holds and throws a physical hero before a single landing hit",()=>{
  const s=caught();
  assert.equal(s.heroPhase,"grabbed");
  const cues:ArenaCue[]=[];
  for(let i=0;i<112;i++)cues.push(...tick(s));
  assert(cues.some(c=>c.kind==="throw"),"throw release follows an actual catch");
  assert.equal(cues.filter(c=>c.kind==="hit").length,1);
  assert.equal(cues.filter(c=>c.kind==="lava").length,0);
  assert(s.heroHp<120);
  assert(["hurt","move"].includes(s.heroPhase));
  assert(Math.hypot(s.hero.x,s.hero.z)<WALKABLE_RADIUS);
});

test("an outward throw crosses the real lava boundary and burns once",()=>{
  const s=caught(true);
  const cues:ArenaCue[]=[];
  for(let i=0;i<112;i++)cues.push(...tick(s));
  const landed=cues.filter(c=>c.kind==="hit");
  const lava=cues.filter(c=>c.kind==="lava");
  assert.equal(landed.length,1,"one physical landing");
  assert.equal(lava.length,1,"one bounded rim contact, never a 60 Hz damage loop");
  assert(lava[0].amount!>0 && lava[0].amount!<=12);
  assert(s.heroHp<base.health);
  assert(Math.hypot(s.hero.x,s.hero.z)<WALKABLE_RADIUS);
  assert(s.outcome==="fighting" || s.outcome==="defeat");
});

test("the boss can die while holding a hero without a stuck grabbed state",()=>{
  const s=caught();
  s.bossHp=0;
  tick(s);
  assert.equal(s.outcome,"victory");
  assert.equal(s.heroPhase,"move");
  assert.equal(s.heroHp,120);
});

test("new clips are replayed from optional metadata without changing old v1 frames",()=>{
  const grab=caught();
  const frame=frameFromCombat(grab,grab.cues);
  assert.equal(frame.attack,"grab");
  const old=createCombatPreview(base);
  assert.equal(Object.hasOwn(frameFromCombat(old),"attack"),false);
  let found=false;
  for(let seed=0;seed<64&&!found;seed++){
    const {replay}=resolveSpatialBoss("hero",4,{...base,tacticsSeed:seed});
    validateBossReplay(replay,"replay","hero",4,replay.outcome);
    if(replay.frames.some(f=>f.attack==="grab" && f.bossPhase==="throw")){
      found=true;
      const forged=structuredClone(replay) as unknown as {frames:{attack?:string}[]};
      const index=forged.frames.findIndex(f=>f.attack==="grab");
      forged.frames[index].attack="teleport";
      assert.throws(()=>validateBossReplay(forged,"replay","hero",4,replay.outcome),
        /attack invalid/);
    }
  }
  assert(found,"new campaign fights must sometimes record a real throw");
});
