import {emptyShopTraffic} from "../../src/game/shopTraffic.ts";
import {WORLD_TICKS_PER_DAY} from "../../src/game/worldClock.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { generateDungeonLayout, dungeonNeighbors } from "../../src/game/dungeonLayout.ts";
import {
  dungeonSiteCooldown, dungeonGenerationSeed, refreshDungeonSites,
  resolveDungeonSite, type DungeonSiteCycle,
} from "../../src/game/dungeonRegeneration.ts";
import { createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { emptyLevel7World, simulateLevel7Day } from "../../src/game/level7Exploration.ts";

const map = generateDungeonLayout(7351, 7);

test("ordinary dungeon sites regenerate on staggered saved intervals without resetting geometry", () => {
  const monster = map.features.find(site => site.kind === "monster")!;
  const chest = map.features.find(site => site.kind === "treasure")!;
  const trap = map.features.find(site => site.kind === "trap")!;
  const sites = [monster, chest, trap];
  const cleared = sites.map(site => site.id);
  const history = sites.reduce<DungeonSiteCycle[]>(
    (records, site) => resolveDungeonSite(records, site.id, 4), [],
  );
  const world = {resolvedFeatureIds:cleared,heroes:[],siteCycles:history};
  const before = refreshDungeonSites(world,map,5);
  assert.deepEqual(before.resolvedFeatureIds,cleared);
  assert.deepEqual(
    before.siteCycles.map(site=>site.id).sort(),
    history.map(site=>site.id).sort(),
    "canonical site records may use layout order rather than action order",
  );
  assert(before.siteCycles.every(site =>
    history.some(original => original.id===site.id &&
      original.cycle===site.cycle && original.resolvedDay===site.resolvedDay)));
  const futureDay = 4 + Math.max(...sites.map(s => dungeonSiteCooldown(map,s)));
  const refreshed = refreshDungeonSites(world,map,futureDay);
  assert.deepEqual(refreshed.resolvedFeatureIds,[]);
  assert(refreshed.siteCycles.every(record =>
    record.cycle === 1 && record.resolvedDay === null));
  assert.deepEqual(map,generateDungeonLayout(7351,7),"regeneration cannot rewrite geometry");
  assert.deepEqual(refreshDungeonSites(world,map,futureDay),refreshed,
    "one deterministic generation per committed input");
  assert.notEqual(dungeonGenerationSeed(123,0),dungeonGenerationSeed(123,1),
    "new generations can produce varied ordinary outcomes");
});

test("occupied site cannot respawn and previous clears don't become free instant loot", () => {
  const chest = map.features.find(site => site.kind === "treasure")!;
  const day = 30;
  const world = {
    resolvedFeatureIds:[chest.id], siteCycles:resolveDungeonSite([],chest.id,2),
    heroes:[{x:chest.x,z:chest.z}],
  };
  const occupied = refreshDungeonSites(world,map,day);
  assert.deepEqual(occupied.resolvedFeatureIds,[chest.id]);
  assert.equal(occupied.siteCycles[0].resolvedDay,2);
  const open = refreshDungeonSites({...world,heroes:[]},map,day);
  assert.equal(open.resolvedFeatureIds.length,0);
  assert.deepEqual(open.siteCycles[0],{id:chest.id,cycle:1,resolvedDay:null});
  const claimed = resolveDungeonSite(open.siteCycles,chest.id,day);
  assert.deepEqual(claimed[0],{id:chest.id,cycle:1,resolvedDay:day});
  assert.equal(refreshDungeonSites(
    {resolvedFeatureIds:[chest.id],heroes:[],siteCycles:claimed},map,day,
  ).resolvedFeatureIds.length,1);

  const legacy = refreshDungeonSites(
    {resolvedFeatureIds:[chest.id],heroes:[]},map,day);
  assert.deepEqual(legacy.siteCycles,[{id:chest.id,cycle:0,resolvedDay:day}],
    "older saves have their cleared sites grandfathered without instant refill");
});

test("Floor 7 uses persistent saved generations and rejects forged save cycles", () => {
  const initial = createGameState(7351);
  const original = initial.adventurers[0];
  const hero = {...original,role:"tank" as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:original.stats.maxHealth, status:"expedition" as const,
    floor:7 as const, bossPass:true};
  const result = simulateLevel7Day(hero,emptyLevel7World(),7351,3);
  const again = simulateLevel7Day(hero,emptyLevel7World(),7351,3);
  assert.deepEqual(result,again);
  assert(Array.isArray(result.world.siteCycles));
  for (const id of result.world.resolvedFeatureIds) {
    const record = result.world.siteCycles?.find(site => site.id===id);
    assert(record && record.resolvedDay===3);
  }
  const state = {...initial,
    day:3,worldClock:{...initial.worldClock,tick:2*WORLD_TICKS_PER_DAY},
    shopTraffic:emptyShopTraffic(3,2*WORLD_TICKS_PER_DAY),
    shopEconomy:{...initial.shopEconomy,
      dailySales:{day:3,units:0,revenue:0}},
    adventurers:initial.adventurers.map(h => h.id===hero.id ? result.adventurer : h),
    dungeonWorlds:[{floor:7 as const,world:result.world}],
    // Ignore replay history: this checks the world/save round-trip separately.
    events:initial.events,
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const chest=map.features.find(x=>x.kind==="treasure")!;
  const invalidWorld={...state.dungeonWorlds.find(w=>w.floor===7)!.world,
    resolvedFeatureIds:[chest.id],
    siteCycles:[{id:chest.id,cycle:0,resolvedDay:null}]};
  assert.throws(()=>parseSave(JSON.stringify(createSave({
    ...state,dungeonWorlds:[{floor:7 as const,world:invalidWorld}],
  }))),/resolvedDay/);
  assert.throws(()=>parseSave(JSON.stringify(createSave({
    ...state,dungeonWorlds:[{floor:7 as const,world:{...state.dungeonWorlds.find(w=>w.floor===7)!.world,
      siteCycles:[{id:"invented-feature",cycle:0,resolvedDay:2}]}}],
  }))),/ordinary feature/);
});

test("renewed monster and chest really re-enter the existing recorded Floor 7 explorer", () => {
  const initial = createGameState(7351);
  const base=initial.adventurers[0];
  const hero={...base,role:"tank" as const,
    status:"expedition" as const,floor:7 as const,bossPass:true,
    health:base.stats.maxHealth,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"}};
  for(const kind of ["monster","treasure"] as const) {
    const target=map.features.find(site=>site.kind===kind)!;
    const approach=dungeonNeighbors(map,target)[0];
    const targetCell=target.z*map.width+target.x;
    const visited=map.tiles.flatMap((tile,i)=>
      tile!=="wall" && i!==targetCell ? [i] : []);
    const world={
      resolvedFeatureIds:map.features.map(site=>site.id),
      siteCycles:map.features.map(site=>({
        id:site.id,cycle:0,resolvedDay:site.id===target.id?1:12,
      })),
      heroes:[{heroId:hero.id,...approach,visited}],
    };
    const first=simulateLevel7Day(hero,world,7351,12);
    const again=simulateLevel7Day(hero,world,7351,12);
    assert.deepEqual(first,again);
    const record=first.world.siteCycles?.find(site=>site.id===target.id);
    assert(record && record.cycle===1,
      "the cooldown must create one real new site generation");
    if(kind==="monster") {
      assert.equal(first.replay.encounters[0]?.featureId,target.id);
      assert.equal(first.replay.encounters[0]?.siteCycle,1);
      assert(first.replay.encounters[0].combat.frames.length>1);
    } else {
      assert(first.replay.steps.some(step=>
        step.action==="treasure"&&step.featureId===target.id),
        "the new chest must award real on-path loot");
      assert.equal(record.resolvedDay,12);
      assert(first.gainedLoot>0);
    }
  }
});
