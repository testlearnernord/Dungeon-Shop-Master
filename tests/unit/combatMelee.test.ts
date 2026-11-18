import assert from "node:assert/strict";
import test from "node:test";
import {
  meleeAbilityProfile, resolveMeleeContact,
} from "../../src/game/combatMelee.ts";
import { bossStrikeGeometry } from "../../src/game/arenaCombatMotion.ts";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat,
  type CombatantSpec,
} from "../../src/game/groupCombat.ts";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

const attacker={x:0,z:2};
const defender={x:0,z:0};
const common={
  attacker,lockedHeading:Math.PI,defender,
  defenderHeading:0,defenderPhase:"move",defenderPhaseAge:0,
} as const;

test("one melee contact authority resolves boss and group miss, dodge, parry and hit",()=>{
  const ordinary=meleeAbilityProfile("ordinary",2.5);
  const troll=meleeAbilityProfile("troll-smash");
  for(const ability of [ordinary,troll,meleeAbilityProfile("heavy",2.5)]){
    assert.equal(resolveMeleeContact({...common,ability}),"hit");
    assert.equal(resolveMeleeContact({
      ...common,lockedHeading:0,ability,
    }),"miss");
    assert.equal(resolveMeleeContact({
      ...common,defenderPhase:"roll",defenderPhaseAge:0.2,ability,
    }),"dodge");
    assert.equal(resolveMeleeContact({
      ...common,defenderPhase:"parry",defenderPhaseAge:0.2,ability,
    }),"parry");
    assert.equal(resolveMeleeContact({
      ...common,defenderPhase:"parry",defenderPhaseAge:0.5,ability,
    }),"hit");
    assert.equal(resolveMeleeContact({
      ...common,lineClear:false,defenderPhase:"roll",
      defenderPhaseAge:0.2,ability,
    }),"miss","a blocked melee swing cannot trigger a dodge");
  }
  assert.deepEqual(bossStrikeGeometry(false),{
    reach:5.2+0.58,halfAngleRadians:0.90,
  });
  assert.deepEqual(bossStrikeGeometry(true),{
    reach:6.2+0.58,halfAngleRadians:1.30,
  });
});

test("troll grab only allows armed parries but retains actual roll/miss behavior",()=>{
  const ability=meleeAbilityProfile("troll-grab");
  assert.equal(resolveMeleeContact({
    ...common,ability,defenderPhase:"parry",defenderPhaseAge:0.20,
    defenderHasWeapon:false,
  }),"hit");
  assert.equal(resolveMeleeContact({
    ...common,ability,defenderPhase:"parry",defenderPhaseAge:0.20,
    defenderHasWeapon:true,
  }),"parry");
  assert.equal(resolveMeleeContact({
    ...common,ability,defenderPhase:"roll",defenderPhaseAge:0.20,
  }),"dodge");
  assert.equal(resolveMeleeContact({
    ...common,ability,lockedHeading:0,
  }),"miss");
});

function duel(heavy:boolean){
  const actors:CombatantSpec[]=[
    {id:"a-hero",team:"heroes",role:"tank",style:"melee",
      x:0,z:0,hp:100,maxHp:100,damage:6,armor:0,
      speed:0,reach:1.5},
    {id:"z-skeleton",team:"monsters",role:"monster",style:"melee",
      x:0,z:2,hp:80,maxHp:80,damage:20,armor:0,
      speed:0,reach:1.6,
      ...(heavy?{meleeAbility:"heavy" as const}:{})},
  ];
  const state=createGroupCombat({
    bounds:{minX:-9,maxX:9,minZ:-9,maxZ:9},actors,
  });
  const hero=state.actors.find(actor=>actor.id==="a-hero")!;
  const monster=state.actors.find(actor=>actor.id==="z-skeleton")!;
  hero.phase="hurt";hero.phaseAge=0;
  monster.phase="strike";monster.phaseAge=0.17;
  monster.lockedHeading=Math.PI;
  monster.targetId=hero.id;
  monster.applied=false;
  return {state,hero,monster,actors};
}

test("ordinary and heavy enemy strikes share contact logic but have meaningful timing and damage",()=>{
  const normal=duel(false),heavy=duel(true);
  stepGroupCombat(normal.state);
  stepGroupCombat(heavy.state);
  assert.equal(normal.hero.hp,80,"ordinary strike connects after its shorter windup");
  assert.equal(heavy.hero.hp,100,"heavy strike cannot damage before its own contact tick");
  for(let i=0;i<2;i++)stepGroupCombat(heavy.state);
  assert.equal(heavy.hero.hp,73,"heavy contact has actual +35% raw damage");
  assert.equal(heavy.state.events.filter(x=>x.kind==="hit").length,1);
  for(let i=0;i<25;i++)stepGroupCombat(heavy.state);
  assert.equal(heavy.hero.hp,73,"one swing cannot hit repeatedly");
  assert.throws(()=>createGroupCombat({bounds:heavy.state.bounds,
    actors:heavy.actors.map(a=>a.id==="z-skeleton"
      ? {...a,style:"ranged" as const}:a)}),/meleeAbility/);
  const input=heavy.actors;
  const result=resolveGroupCombat({bounds:heavy.state.bounds,actors:input},12);
  assert.deepEqual(result,resolveGroupCombat({
    bounds:heavy.state.bounds,actors:[...input].reverse(),
  },12));
  assert.equal(result.replay.actors.find(a=>a.id==="z-skeleton")!.meleeAbility,"heavy");
});

test("historic no-ability v1 replays still validate; special abilities are strict and saved",()=>{
  let state=createGameState(7351);
  let event=state.events.find(e=>e.type==="dungeon-exploration"&&
    !!e.dungeonReplay?.encounters.length);
  for(let i=0; i<24 && !event;i++){
    state=advanceDay(state).state;
    event=state.events.find(e=>e.type==="dungeon-exploration"&&
      !!e.dungeonReplay?.encounters.length);
  }
  assert(event?.dungeonReplay?.encounters.length,
    "fixture needs a real early-floor monster replay");
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const base:any=structuredClone(createSave(state));
  const saved=base.payload.events.find((e:any)=>e.id===event!.id);
  const monster=saved.dungeonReplay.encounters[0].combat.actors
    .find((a:any)=>a.team==="monsters");
  assert(monster);
  monster.meleeAbility="heavy";
  assert.doesNotThrow(()=>parseSave(JSON.stringify(base)));
  monster.meleeAbility="instant-win";
  assert.throws(()=>parseSave(JSON.stringify(base)),/meleeAbility/);
});
