import assert from "node:assert/strict";
import test from "node:test";
import {
  BOSS_MAX_HP, WALKABLE_RADIUS, bossStrikeGeometry, createCombatPreview, inAttackArc,
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
  assert.equal(hit.heroHp,89);
  assert.equal(hit.bossDamageApplied,true);
  tick(hit,4);
  assert.equal(hit.heroHp,89,"single attack must not damage the hero every frame");

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

test("lava deals bounded real damage and interrupted heals cannot resolve",()=>{
  const lava=createCombatPreview(options);
  lava.hero={x:17.5,z:0};
  tick(lava);
  assert.equal(lava.outcome,"fighting");
  assert.equal(lava.heroHp,88);
  assert.deepEqual(lava.cues.find(c=>c.kind==="lava"),{kind:"lava",amount:12});
  assert(Math.hypot(lava.hero.x,lava.hero.z)<WALKABLE_RADIUS);
  tick(lava,20);
  assert.equal(lava.heroHp,88,"safe landing prevents repeated invisible lava ticks");

  const heal=imminentSwing();
  heal.heroPhase="heal"; heal.heroAge=0.30;
  heal.heroHp=25; heal.healingSupplies=1;
  tick(heal);
  assert.equal(heal.heroPhase,"hurt");
  assert.equal(heal.healingSupplies,1);
  assert(heal.heroHp<25);
});

test("windup reads vary by fighter and attack: real hits, dodges and parries all occur", () => {
  let damaged = 0, dodged = 0, parried = 0;
  for (let seed = 0; seed < 96; seed++) {
    const s = createCombatPreview({
      ...options, role: seed % 2 ? "tank" : "DPS", tacticsSeed: seed,
      agility: 9 + seed % 7, health: 170, maxHealth: 170,
    });
    s.boss = {x:0,z:0}; s.hero = {x:0,z:3};
    s.bossPhase = "windup"; s.bossAge = 0.68;
    s.bossAttacks = 1; s.lockedBossHeading = 0;
    tick(s, 24);
    if (s.heroHp < 170) damaged++;
    if (s.dodgeCount > 0) dodged++;
    if (s.parryCount > 0) parried++;
  }
  assert(damaged > 0, "not every warning can trigger an automatic perfect defense");
  assert(dodged > 0, "correctly timed rolls still avoid real hits");
  assert(parried > 0, "sword users can still parry");
});

test("rare risky rolls reach lava and burn once, rather than every frame", () => {
  let found = false;
  for (let seed = 0; seed < 160 && !found; seed++) {
    const s = createCombatPreview({
      ...options,role:"DPS", sword:false, tacticsSeed:seed,
      agility:9, health:150,maxHealth:150,
    });
    s.boss={x:12,z:0}; s.hero={x:15,z:0};
    s.bossPhase="windup"; s.bossAge=0.68; s.bossAttacks=1;
    s.lockedBossHeading=Math.PI/2;
    let burns = 0;
    for (let i=0;i<50;i++) {
      const cues=stepCombatPreview(s,1/60);
      burns += cues.filter(c=>c.kind==="lava").length;
    }
    if (burns>0) {
      found=true;
      assert.equal(burns,1,"the same roll must not burn every frame");
      assert(s.heroHp<150,"lava is real HP damage");
      assert(Math.hypot(s.hero.x,s.hero.z)<WALKABLE_RADIUS);
    }
  }
  assert(found,"some badly chosen edge dodges must reach the molten ring");
});

test("tactics choices remain identical for the same 60 Hz fight seed", () => {
  const opts={...options,role:"DPS" as const,agility:12,tacticsSeed:13572};
  const a=createCombatPreview(opts), b=createCombatPreview(opts);
  for(let i=0;i<60*70 && a.outcome==="fighting" && b.outcome==="fighting";i++){
    stepCombatPreview(a,1/60);
    stepCombatPreview(b,1/60);
  }
  assert.deepEqual(a,b,"defense decisions and lava accidents must be replayable");
});
