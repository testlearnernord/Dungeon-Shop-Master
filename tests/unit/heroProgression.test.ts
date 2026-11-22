import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {prepareSpatialDungeonCombat,emptyLevel7World} from "../../src/game/level7Exploration.ts";
import {lastWorldTickOfDay} from "../../src/game/worldClock.ts";
import {developerHeroFromRoster,buildDeveloperCombat,DEFAULT_DEVELOPER_CONFIG}
  from "../../src/game/developerCombatScenario.ts";
import {caveTrollGroupOptions} from "../../src/game/sharedBossCombat.ts";
import {useHealingSupplies} from "../../src/game/adventurers.ts";
import {
  heroLevel,heroProgression,settleHeroExperience,HERO_POWER_CAP_LEVEL,
} from "../../src/game/heroProgression.ts";

const initial=createGameState(7351);
const first=(role:"tank"|"DPS"|"healer")=>{
  const base=initial.adventurers[0];
  return {...base,role,status:"exploring" as const,floor:1 as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"}};
};
const atLevel=(role:"tank"|"DPS"|"healer",level:number)=>{
  const h=first(role);
  const candidate={...h,level,xp:(level-1)*100};
  return {...candidate,health:heroProgression(candidate).maxHealth};
};

test("class progression is deterministic, role-specific, bounded and does not mutate base stats",()=>{
  assert.equal(heroLevel(0),1);
  assert.equal(heroLevel(999),10);
  const old=initial.adventurers[0];
  const baseline=heroProgression(old);
  assert.equal(baseline.maxHealth,old.stats.maxHealth);
  assert.equal(baseline.damageBonus,0);
  assert.equal(baseline.armorBonus,0);
  for(const role of ["tank","DPS","healer"] as const){
    const h=atLevel(role,12);
    const original=structuredClone(h);
    const progress=heroProgression(h);
    assert.deepEqual(progress,heroProgression(h));
    assert.deepEqual(h,original,"Projection must be pure and leave seeded stats untouched");
    assert(progress.maxHealth>h.stats.maxHealth);
    assert.equal(heroProgression(atLevel(role,500)).maxHealth,
      heroProgression(atLevel(role,HERO_POWER_CAP_LEVEL)).maxHealth,
      "Level 20 is the strength cap even when earned XP keeps accumulating.");
  }
  const tank=heroProgression(atLevel("tank",12));
  const dps=heroProgression(atLevel("DPS",12));
  const healer=heroProgression(atLevel("healer",12));
  assert.equal(tank.armorBonus,2);
  assert.equal(tank.maxHealth,first("tank").stats.maxHealth+44);
  assert.equal(dps.armorBonus,0);
  assert(dps.damageBonus>tank.damageBonus);
  assert(dps.agility>first("DPS").stats.agility);
  assert.equal(healer.bonusMagicHeals,1);
  assert.equal(healer.dungeonMagicHeals,2);
  assert(healer.intellect>first("healer").stats.intellect);
});

test("level-up increases current and maximum HP equally, retains wounds, cannot revive the dead",()=>{
  const base=first("tank");
  const wounded={...base,health:base.health-15};
  const progressed=settleHeroExperience(wounded,350,wounded.health);
  assert.equal(progressed.level,4);
  assert.equal(progressed.stats.maxHealth,base.stats.maxHealth,
    "Base HP stays the original seeded value.");
  assert.equal(progressed.health,wounded.health+12);
  assert.equal(heroProgression(progressed).maxHealth,
    base.stats.maxHealth+12);
  assert.equal(heroProgression(progressed).maxHealth-progressed.health,15,
    "Gain in capacity is not a free full heal.");
  assert.equal(settleHeroExperience({...progressed,health:0},400,0).health,0);
  assert.deepEqual(settleHeroExperience(progressed,progressed.xp),progressed,
    "Same XP has no duplicated bonus");
  assert.throws(()=>settleHeroExperience(progressed,progressed.xp-1),/Experience/);
  const full=settleHeroExperience(base,100,base.stats.maxHealth);
  assert.equal(full.health,heroProgression(full).maxHealth);
});

test("one authoritative spatial GroupCombat and Combat Lab use the exact same scaled fighter",()=>{
  const seed=7351,layout=generateExpeditionLayout(seed,1);
  const monster=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0)!;
  assert(monster);
  const approach=dungeonNeighbors(layout,monster)[0];
  for(const role of ["tank","DPS","healer"] as const){
    const hero=atLevel(role,12);
    const real=prepareSpatialDungeonCombat([hero],monster,seed,layout,approach);
    const spec=real.options.actors.find(a=>a.id===hero.id)!;
    const converted=developerHeroFromRoster(hero);
    const lab=buildDeveloperCombat({...DEFAULT_DEVELOPER_CONFIG,
      arena:"crypt",enemy:"ghoul",heroes:[converted]});
    const observed=lab.actors.find(a=>a.team==="heroes")!;
    assert.equal(spec.maxHp,converted.maxHp);
    assert.equal(spec.damage,converted.damage);
    assert.equal(spec.armor,converted.armor);
    assert.equal(spec.agility,converted.agility);
    assert.equal(spec.magicHeals,converted.magicHeals);
    for(const key of ["maxHp","damage","armor","agility","healCharges","magicHeals"] as const)
      assert.equal(spec[key],observed[key],role+" "+key);
  }
});

test("boss group authority applies role bonuses without altering training fixtures",()=>{
  for(const role of ["tank","DPS","healer"] as const){
    const old=first(role),veteran=atLevel(role,12);
    const normal=heroProgression(old),grown=heroProgression(veteran);
    const options=(h:typeof veteran,progress:typeof grown)=>({
      role:h.role,sword:true,armor:true,health:h.health,
      maxHealth:progress.maxHealth,healingSupplies:0,
      strength:progress.strength,agility:progress.agility,
      intellect:progress.intellect,
      progressionDamageBonus:progress.damageBonus,
      progressionArmorBonus:progress.armorBonus,
      progressionMagicHeals:progress.bonusMagicHeals,
    });
    const before=caveTrollGroupOptions(options(old,normal)).actors[0];
    const after=caveTrollGroupOptions(options(veteran,grown)).actors[0];
    assert(after.maxHp>before.maxHp);
    assert(after.damage>=before.damage);
    assert(after.armor>=before.armor);
    if(role==="tank")assert(after.armor>before.armor);
    if(role==="healer")assert((after.magicHeals??0)>(before.magicHeals??0));
  }
});

test("levelled v29 saves validate earned HP and feed the unique Floor-10 party motor",()=>{
  const seed=7351,base=createGameState(seed);
  const original=base.adventurers.find(h=>h.status==="at-shop")!;
  const leveled={...original,level:10,xp:900};
  const cap=heroProgression(leveled).maxHealth;
  const hero={...leveled,health:cap,bossPass:true};
  const state={...base,adventurers:base.adventurers.map(h=>h.id===original.id?hero:h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const tampered=structuredClone(createSave(state));
  const target=tampered.payload.adventurers.find(h=>h.id===hero.id)!;
  (target as {health:number}).health=cap+1;
  assert.throws(()=>parseSave(JSON.stringify(tampered)),/health/);

  // World-clock ownership and actual saved co-located stair crossing are
  // tested in caveTrollPartyLive.test.ts. Fighter stats are composed ONLY
  // from real roster heroes; no surviving solo Floor-6 boss option exists.
  const fighters=state.adventurers.slice(0,3).map(h=>({
    ...h,bossPass:true,status:"expedition" as const,floor:10 as const,
  }));
  const fight=caveTrollGroupOptions(fighters,42);
  const actor=fight.actors.find(a=>a.id===hero.id)!;
  assert(actor,"Real hero must be part of the actual Floor-10 party.");
  assert.equal(actor.maxHp,cap);
  assert.equal(actor.armor,
    (hero.equipment.armor==="Leather Vest"?7:0)+
    (hero.role==="tank"?3:0)+heroProgression(hero).armorBonus);
  assert.equal(fight.actors.filter(a=>a.team==="heroes").length,3);
  assert.equal(fight.actors.find(a=>a.id==="cave-troll")?.maxHp,700);
});

test("levelled heroes can spend real medicine above base HP without forging items",()=>{
  const h=atLevel("tank",12);
  const wounded={...h,health:h.stats.maxHealth,
    inventory:{...h.inventory,bread:1,healing:0}};
  const healed=useHealingSupplies(wounded,1);
  assert.equal(healed.adventurer.health,wounded.health+8);
  assert.equal(healed.adventurer.inventory.bread,0);
  assert.equal(healed.events.length,1);
});

test("late-night ordinary encounters defer their start instead of trapping Galvik before bedtime",()=>{
  const seed=7351,base=createGameState(seed);
  const layout=generateExpeditionLayout(seed,1);
  const site=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0)!;
  const approach=dungeonNeighbors(layout,site)[0];
  const hero=base.adventurers[0];
  const walkable=layout.tiles.flatMap((t,i)=>t!=="wall"&&
    i!==site.z*layout.width+site.x?[i]:[]);
  const state={...base,adventurers:base.adventurers.map(h=>h.id===hero.id?
    {...h,status:"exploring" as const,floor:1 as const}:{
      ...h,status:"at-shop" as const,floor:5 as const,shopStayDays:0,
    }),
    earlyDungeonWorlds:[{floor:1 as const,world:{
      ...emptyLevel7World(),resolvedFeatureIds:layout.features.filter(f=>f.id!==site.id)
        .map(f=>f.id),
      heroes:[{heroId:hero.id,...approach,visited:walkable}],
    }}],
  };
  const store=new GameStore(state);
  store.advanceWorldTime(lastWorldTickOfDay(1)-300);
  store.enableLiveDungeon();
  store.advanceWorldTime(200);
  assert.equal(store.state.liveDungeon.combats.length,0,
    "Do not start a 25-second fight with less than 25 seconds remaining.");
  assert.doesNotThrow(()=>store.endDay(),"Galvik must still be able to sleep");
  assert.equal(store.state.day,2);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});
