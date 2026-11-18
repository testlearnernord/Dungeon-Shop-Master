import assert from "node:assert/strict";
import test from "node:test";
import { generateDungeonLayout } from "../../src/game/dungeonLayout.ts";
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
  assert.deepEqual(before.siteCycles,history);
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
    floor:7 as const, level6Permit:true};
  const result = simulateLevel7Day(hero,emptyLevel7World(),7351,3);
  const again = simulateLevel7Day(hero,emptyLevel7World(),7351,3);
  assert.deepEqual(result,again);
  assert(Array.isArray(result.world.siteCycles));
  for (const id of result.world.resolvedFeatureIds) {
    const record = result.world.siteCycles?.find(site => site.id===id);
    assert(record && record.resolvedDay===3);
  }
  const state = {...initial,
    day:3,
    shopEconomy:{...initial.shopEconomy,
      dailySales:{day:3,units:0,revenue:0}},
    adventurers:initial.adventurers.map(h => h.id===hero.id ? result.adventurer : h),
    level7World:result.world,
    // Ignore replay history: this checks the world/save round-trip separately.
    events:initial.events,
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const chest=map.features.find(x=>x.kind==="treasure")!;
  const invalidWorld={...state.level7World,
    resolvedFeatureIds:[chest.id],
    siteCycles:[{id:chest.id,cycle:0,resolvedDay:null}]};
  assert.throws(()=>parseSave(JSON.stringify(createSave({
    ...state,level7World:invalidWorld,
  }))),/resolvedDay/);
  assert.throws(()=>parseSave(JSON.stringify(createSave({
    ...state,level7World:{...state.level7World,
      siteCycles:[{id:"invented-feature",cycle:0,resolvedDay:2}]},
  }))),/ordinary feature/);
});
