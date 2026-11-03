import assert from "node:assert/strict";
import test from "node:test";
import {
  BOSS_MAX_HP, bossStrikeGeometry, createCombatPreview, inAttackArc,
  parryActive, rollInvulnerable, stepCombatPreview, type CombatPreviewOptions,
} from "../../src/game/arenaCombatMotion.ts";

const options: CombatPreviewOptions = {
  role: "tank", sword: true, armor: true,
  health: 100, maxHealth: 100, healingSupplies: 2,
};
const tick = (s: ReturnType<typeof createCombatPreview>, steps = 1) => {
  for (let i = 0; i < steps; i++) stepCombatPreview(s, 1/60);
};

test("actual strike geometry rejects side, back and out-of-range targets", () => {
  const origin={x:0,z:0};
  assert(inAttackArc(origin, 0, {x:0,z:3},5,0.9));
  assert(!inAttackArc(origin,0,{x:0,z:-3},5,0.9));
  assert(!inAttackArc(origin,0,{x:4,z:0},5,0.9));
  assert(!inAttackArc(origin,0,{x:0,z:6},5,0.9));
  const standardStrike = bossStrikeGeometry(false);
  const slamStrike = bossStrikeGeometry(true);
  assert.equal(standardStrike.reach, 5.78);
  assert.equal(standardStrike.halfAngleRadians, 0.90);
  assert.equal(slamStrike.reach, 6.78);
  assert.equal(slamStrike.halfAngleRadians, 1.3);
  assert(inAttackArc(origin, 0, {x:6,z:2}, slamStrike.reach, slamStrike.halfAngleRadians));
  assert(rollInvulnerable(0.2));
  assert(!rollInvulnerable(0.04));
  assert(!rollInvulnerable(0.50));
  assert(parryActive(0.25));
  assert(!parryActive(0.06));
  assert(!parryActive(0.42));
});

function imminentSwing() {
  const s=createCombatPreview({...options, armor:false, sword:true});
  s.boss={x:0,z:0};
  s.hero={x:0,z:3};
  s.lockedBossHeading=0; s.bossHeading=0;
  s.bossPhase="strike"; s.bossAge=0.13;
  s.bossDamageApplied=false;
  return s;
}

test("troll damage only applies at active hit frame within locked arc", () => {
  const hit=imminentSwing();
  tick(hit);
  assert.equal(hit.heroHp,86);
  assert.equal(hit.bossDamageApplied,true);
  tick(hit,4);
  assert.equal(hit.heroHp,86,"single attack must not damage the hero every frame");

  const side=imminentSwing();
  side.hero={x:6,z:0};
  tick(side);
  assert.equal(side.heroHp,100);
  assert.equal(side.missedHits,1);

  const dodged=imminentSwing();
  dodged.heroPhase="roll"; dodged.heroAge=0.20;
  dodged.rollDirection={x:1,z:0};
  tick(dodged);
  assert.equal(dodged.heroHp,100);
  assert.equal(dodged.dodgeCount,1);
  assert.equal(dodged.bossPhase,"strike");
});

test("parry only within timing and facing window and interrupts boss attack", () => {
  const parry=imminentSwing();
  parry.heroPhase="parry"; parry.heroAge=0.19;
  tick(parry);
  assert.equal(parry.heroHp,100);
  assert.equal(parry.parryCount,1);
  assert.equal(parry.bossPhase,"stagger");
  assert.equal(parry.bossHp,BOSS_MAX_HP-8);
  assert(parry.cues.some(c=>c.kind==="parry"));
  const late=imminentSwing();
  late.heroPhase="parry"; late.heroAge=0.38;
  tick(late);
  assert(late.heroHp<100);
  assert.equal(late.parryCount,0);
});

test("AI starts parry and roll late enough for their active defense windows to cover impact", () => {
  const tank = createCombatPreview(options);
  tank.boss = {x: 0, z: 0};
  tank.hero = {x: 0, z: 3};
  tank.bossPhase = "windup";
  tank.bossAge = 0.68;
  tank.lockedBossHeading = 0;
  tick(tank);
  assert.equal(tank.heroPhase, "parry", "tank AI should initiate its own parry");
  tick(tank, 20);
  assert.equal(tank.parryCount, 1);
  assert.equal(tank.heroHp, 100);

  const slammer = createCombatPreview(options);
  slammer.boss = {x: 0, z: 0};
  slammer.hero = {x: 0, z: 3};
  slammer.bossPhase = "windup";
  slammer.bossAge = 0.88;
  slammer.bossSlam = true;
  slammer.lockedBossHeading = 0;
  tick(slammer);
  assert.equal(slammer.heroPhase, "parry", "tank AI should time its parry for a slam");
  tick(slammer, 20);
  assert.equal(slammer.parryCount, 1);
  assert.equal(slammer.heroHp, 100);

  const dodger = createCombatPreview({...options, role: "DPS", sword: false});
  dodger.boss = {x: 0, z: 0};
  dodger.hero = {x: 0, z: 3};
  dodger.bossPhase = "windup";
  dodger.bossAge = 0.68;
  dodger.lockedBossHeading = 0;
  tick(dodger);
  assert.equal(dodger.heroPhase, "roll", "DPS AI should initiate its own roll");
  tick(dodger, 20);
  assert.equal(dodger.dodgeCount, 1);
  assert.equal(dodger.heroHp, 100);
});

test("AI physically circles, chases, dodges and attacks at fixed timestep", () => {
  const a=createCombatPreview({...options,role:"DPS",sword:false,armor:true,health:500,maxHealth:500});
  const b=createCombatPreview({...a.options});
  a.bossHp=b.bossHp=1000;
  for(let i=0;i<60*24;i++){
    stepCombatPreview(a,1/60);
    stepCombatPreview(b,1/60);
  }
  assert.deepEqual(a,b,"60 Hz AI must not depend on render framerate or Math.random");
  assert(a.distanceTraveled>12, "hero must strafe/dodge across the 3D arena");
  assert(Math.hypot(a.boss.x,a.boss.z-2)>1,"boss must pursue, not rotate in place");
  assert(a.landedHits>0,"moving projectiles must actually hit the troll");
  assert(a.bossAttacks>0,"club must swing at hero's dynamic position");
  assert(a.stamina>=0 && a.stamina<=100);
});

test("projectiles move until collision, never instantly deliver ranged damage",()=>{
  const s=createCombatPreview({...options,role:"healer",sword:false});
  s.heroPhase="cast"; s.heroAge=0.305; s.heroCooldown=5;
  s.bossPhase="stagger"; s.bossAge=0;
  tick(s);
  assert.equal(s.projectiles.length,1);
  assert.equal(s.bossHp,BOSS_MAX_HP);
  tick(s,60);
  assert(s.bossHp<BOSS_MAX_HP,"projectile must travel and intersect the actual moving target");
  assert.equal(s.projectiles.length,0);
});

test("lava is lethal and interrupted heals cannot resolve",()=>{
  const lava=createCombatPreview(options);
  lava.hero={x:17.5,z:0};
  tick(lava);
  assert.equal(lava.outcome,"defeat");
  assert(lava.cues.some(c=>c.kind==="lava"));

  const heal=imminentSwing();
  heal.heroPhase="heal"; heal.heroAge=0.30;
  heal.heroHp=25; heal.healingSupplies=1;
  tick(heal);
  assert.equal(heal.heroPhase,"hurt");
  assert.equal(heal.healingSupplies,1);
  assert(heal.heroHp<25);
});
