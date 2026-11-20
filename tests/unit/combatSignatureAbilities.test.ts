import assert from "node:assert/strict";
import test from "node:test";
import {chooseTrollSignatureAttack,trollSignatureProfile,
  fromTrollGroupAbility} from "../../src/game/combatSignatureAbilities.ts";
import {trollDefenseReadiness} from "../../src/game/combatTactics.ts";
import {meleeAbilityProfile} from "../../src/game/combatMelee.ts";
import {GRAPPLE_TIMING} from "../../src/game/combatGrapple.ts";
import {createCombatPreview,stepCombatPreview}
  from "../../src/game/arenaCombatMotion.ts";
import {createGroupCombat,stepGroupCombat,resolveGroupCombat,
  type CombatantSpec} from "../../src/game/groupCombat.ts";

const bounds={minX:-12,maxX:12,minZ:-12,maxZ:12};
const boss:CombatantSpec={id:"boss",team:"monsters",role:"monster",
  style:"melee",x:0,z:3,hp:280,maxHp:280,damage:33,armor:10,
  speed:2.8,reach:1.8,radius:1.3,agility:8,staggerThreshold:18,
  specialAbility:"grapple-throw",grappleDamage:42};
const hero:CombatantSpec={id:"hero",team:"heroes",role:"DPS",
  style:"melee",x:0,z:0,hp:220,maxHp:220,damage:5,
  armor:4,speed:2.7,reach:1.6,agility:11};

test("group and original Level-6 duel reference one Troll signature contract",()=>{
  const smash=trollSignatureProfile("smash");
  const slam=trollSignatureProfile("slam");
  const grab=trollSignatureProfile("grab");
  assert.equal(smash.windupSeconds,.85);
  assert.equal(slam.windupSeconds,1.05);
  assert.equal(grab.windupSeconds,GRAPPLE_TIMING.windup);
  assert.equal(grab.contactSeconds,GRAPPLE_TIMING.grabContact);
  assert.equal(grab.actionSeconds,GRAPPLE_TIMING.grab);
  assert.equal(grab.recoverySeconds,GRAPPLE_TIMING.recover);
  assert.equal(smash.contactSeconds,.14);
  assert.equal(smash.actionSeconds,.38);
  assert.equal(slam.soloRawDamage,47);
  assert.equal(smash.soloRawDamage,33);
  assert.equal(slam.groupAbility,"troll-slam");
  assert.equal(grab.groupAbility,"grapple");
  assert.equal(fromTrollGroupAbility("grapple"),"grab");
  assert.equal(meleeAbilityProfile("troll-slam").damageMultiplier,47/33);
  assert.equal(slam.reach,meleeAbilityProfile("troll-slam").reach);
  assert.equal(chooseTrollSignatureAttack(1,4,.9),"smash");
  assert.equal(chooseTrollSignatureAttack(3,4,.9),"slam");
  assert.equal(chooseTrollSignatureAttack(2,4,.1),"grab");
  assert.equal(chooseTrollSignatureAttack(2,7,.1),"smash");
  assert.equal(trollDefenseReadiness(10,"tank",false),.65);
  assert.equal(trollDefenseReadiness(10,"DPS",true),.47);
  assert.throws(()=>trollDefenseReadiness(Infinity,"tank",false),RangeError);
});

function forcedStrike(ability:"troll-smash"|"troll-slam"){
  const state=createGroupCombat({bounds,actors:[boss,hero]});
  const enemy=state.actors.find(x=>x.id==="boss")!;
  const victim=state.actors.find(x=>x.id==="hero")!;
  enemy.activeMeleeAbility=ability;
  enemy.phase="windup";
  enemy.phaseAge=trollSignatureProfile(
    fromTrollGroupAbility(ability)).windupSeconds-1/60;
  enemy.lockedHeading=Math.PI;
  enemy.heading=Math.PI;
  enemy.targetId=victim.id;
  enemy.attacksStarted=3;
  victim.phase="hurt";victim.phaseAge=0;
  return {state,enemy,victim};
}

test("actual group Troll smash and slam have same timed contact, not a visual fake",()=>{
  for(const [ability,damage] of [
    ["troll-smash",29],["troll-slam",43],
  ] as const){
    const {state,enemy,victim}=forcedStrike(ability);
    stepGroupCombat(state);
    assert.equal(enemy.phase,"strike","windup must finish before contact");
    assert.equal(victim.hp,220,"no damage before the committed strike window");
    for(let i=0;i<8;i++)stepGroupCombat(state);
    assert.equal(victim.hp,220,"the windup visual itself is not a hit");
    stepGroupCombat(state);
    assert.equal(victim.hp,220-damage,
      "saved 60Hz strike deals shared raw damage minus real armor once");
    const hits=state.events.filter(e=>e.kind==="hit"&&e.actorId==="boss");
    assert.equal(hits.length,1);
    assert.equal(hits[0].amount,damage);
    for(let i=0;i<8;i++)stepGroupCombat(state);
    assert.equal(victim.hp,220-damage,"one contact cannot apply twice");
  }
});

test("multi-actor special boss still runs one deterministic group pipeline",()=>{
  const healer:CombatantSpec={
    ...hero,id:"healer",role:"healer",style:"ranged",
    x:-4,z:-3,damage:5,hp:120,maxHp:120,healCharges:2,
  };
  const set={bounds,actors:[boss,hero,healer]};
  const first=resolveGroupCombat(set,35);
  const reversed=resolveGroupCombat(
    {...set,actors:[...set.actors].reverse()},35);
  assert.deepEqual(first.state,reversed.state);
  assert.deepEqual(first.replay.frames,reversed.replay.frames);
  assert.deepEqual(first.replay.cues,reversed.replay.cues);
  assert(first.replay.frames.some(f=>f.actors.some(a=>a.phase==="windup")));
  assert(first.replay.cues.some(c=>c.kind==="attack"&&c.actorId==="boss"));
  assert(first.state.actors.some(a=>a.distanceTraveled>0));
  assert(first.replay.actors.length===3);
});

test("the legacy Level-6 boss remains separately reproducible with its v1 phases",()=>{
  const opts={role:"tank" as const,sword:true,armor:true,health:120,
    maxHealth:120,healingSupplies:1,agility:12,tacticsSeed:17};
  const a=createCombatPreview(opts),b=createCombatPreview(opts);
  for(let i=0;i<2000;i++){
    assert.deepEqual(stepCombatPreview(a,1/60),stepCombatPreview(b,1/60));
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
  assert(a.bossAttacks>0);
});
