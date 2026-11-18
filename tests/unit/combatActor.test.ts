import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCombatActorPhase, combatActorActivity, enterCombatActorPhase,
  refreshCombatActorResources,
} from "../../src/game/combatActor.ts";
import {
  bossEncounterActors, createCombatPreview, stepCombatPreview,
} from "../../src/game/arenaCombatMotion.ts";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat,
} from "../../src/game/groupCombat.ts";
import {
  resolveSpatialBoss, validateBossReplay,
} from "../../src/game/bossCombatReplay.ts";

const options={
  role:"tank" as const,sword:true,armor:true,
  health:110,maxHealth:110,healingSupplies:2,
  agility:12,strength:11,intellect:10,tacticsSeed:17,
};
const groupOptions={
  bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
  actors:[
    {id:"hero",team:"heroes" as const,role:"tank" as const,
      style:"melee" as const,x:-2,z:0,hp:50,maxHp:50,
      speed:2.6,reach:1.6,damage:9,armor:3},
    {id:"skeleton",team:"monsters" as const,role:"monster" as const,
      style:"melee" as const,x:2,z:0,hp:42,maxHp:42,
      speed:2.4,reach:1.6,damage:8,armor:1,meleeAbility:"heavy" as const},
  ],
};

test("normal group actors implement the same live combat state contract as the boss",()=>{
  const group=createGroupCombat(groupOptions);
  const hero=group.actors.find(actor=>actor.id==="hero")!;
  assert.equal(hero.hp,50);
  enterCombatActorPhase(hero,"windup");
  assert.equal(hero.phase,"windup");
  assert.equal(hero.phaseAge,0);
  assert.equal(hero.applied,false);
  const tick=advanceCombatActorPhase(hero,1/60,{completeAt:0.62});
  assert(!tick.complete);
  assert.equal(hero.phaseAge,1/60);
  refreshCombatActorResources(hero,1/60,17);
  assert(hero.stamina<=100);
  assert.equal(combatActorActivity(hero.phase),"attack");
  assert.deepEqual(createGroupCombat(groupOptions),createGroupCombat(groupOptions));
});

test("boss actor live adapters mutate original state without a copied HP/phase authority",()=>{
  const combat=createCombatPreview(options);
  const [hero,troll]=bossEncounterActors(combat);
  assert.equal(hero.team,"heroes");
  assert.equal(troll.team,"monsters");
  assert.equal(hero.hp,110);
  assert.equal(troll.hp,280);
  assert.equal(hero.phase,"move");
  assert.equal(troll.phase,"chase");
  hero.hp=60;
  troll.hp=225;
  hero.x=3.25;
  troll.z=-1.75;
  assert.equal(combat.heroHp,60);
  assert.equal(combat.bossHp,225);
  assert.equal(combat.hero.x,3.25);
  assert.equal(combat.boss.z,-1.75);
  const [anotherHero,anotherTroll]=bossEncounterActors(combat);
  assert.equal(anotherHero.hp,60,"no stale actor copy");
  assert.equal(anotherTroll.z,-1.75);
  enterCombatActorPhase(hero,"roll");
  enterCombatActorPhase(troll,"grab");
  assert.equal(combat.heroPhase,"roll");
  assert.equal(combat.bossPhase,"grab");
  assert.equal(combat.heroAge,0);
  assert.equal(combat.bossAge,0);
  assert.equal(hero.applied,false);
  assert.equal(troll.applied,false);
  const hTick=advanceCombatActorPhase(hero,1/60,{completeAt:0.53});
  const bTick=advanceCombatActorPhase(troll,1/60,{contactAt:0.30,completeAt:1.25});
  assert.equal(hTick.age,combat.heroAge);
  assert.equal(bTick.age,combat.bossAge);
  hero.applied=true;
  troll.applied=true;
  assert.equal(combat.heroApplied,true);
  assert.equal(combat.bossDamageApplied,true);
  const before=combat.heroCooldown;
  refreshCombatActorResources(hero,1/60,18);
  assert(combat.heroCooldown<=before);
  assert.equal(hero.stamina,combat.stamina);
  assert.equal(combatActorActivity(hero.phase),"defend");
  assert.equal(combatActorActivity(troll.phase),"grab");
  assert.deepEqual(Object.keys(combat).includes("actors"),false,
    "do not persist a second independent actor registry inside v13 boss state");
});

test("universal phase categories preserve all existing legacy v1 animation labels",()=>{
  const examples={
    move:"move",chase:"move",windup:"attack",strike:"attack",
    attack:"attack",cast:"attack",roll:"defend",parry:"defend",
    heal:"heal",recover:"recover",stagger:"recover",grabMiss:"recover",
    grab:"grab",throw:"grab",grabbed:"grab",thrown:"grab",
    hurt:"disabled",dead:"dead",
  } as const;
  for(const [phase,kind] of Object.entries(examples))
    assert.equal(combatActorActivity(phase),kind);
  assert.throws(()=>combatActorActivity("invisible-instant-kill"),RangeError);
});

test("real ordinary and boss motor remain deterministic using live actor lifecycle",()=>{
  const a=createGroupCombat(groupOptions),b=createGroupCombat(groupOptions);
  for(let i=0;i<1500;i++){
    assert.deepEqual(stepGroupCombat(a),stepGroupCombat(b));
    if(a.outcome!=="fighting")break;
  }
  assert.deepEqual(a,b);
  const first=resolveGroupCombat(groupOptions,25);
  const second=resolveGroupCombat(groupOptions,25);
  assert.deepEqual(first,second);
  assert(first.replay.frames.length>1);

  const bossA=createCombatPreview(options),bossB=createCombatPreview(options);
  for(let tick=0;tick<2700;tick++){
    assert.deepEqual(stepCombatPreview(bossA,1/60),stepCombatPreview(bossB,1/60));
    const [hero,troll]=bossEncounterActors(bossA);
    assert.equal(hero.hp,bossA.heroHp);
    assert.equal(troll.hp,bossA.bossHp);
    assert.equal(hero.phase,bossA.heroPhase);
    assert.equal(troll.phase,bossA.bossPhase);
    if(bossA.outcome!=="fighting")break;
  }
  assert.deepEqual(bossA,bossB);
  assert(bossA.bossAttacks>0);
  const recorded=resolveSpatialBoss("hero-actor-compat",3,options);
  assert.deepEqual(recorded,resolveSpatialBoss("hero-actor-compat",3,options));
  assert.equal(recorded.replay.version,1);
  validateBossReplay(recorded.replay,"recorded.replay",
    "hero-actor-compat",3,recorded.replay.outcome);
});
