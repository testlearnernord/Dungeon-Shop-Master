import assert from "node:assert/strict";
import test from "node:test";
import { generateAdventurer, type AdventurerState } from "../../src/game/adventurers.ts";
import {
  chooseHeroDungeonDecision,
} from "../../src/game/dungeonDecisions.ts";
import {
  dungeonNeighbors, generateExpeditionLayout,
} from "../../src/game/dungeonLayout.ts";
import {
  emptyLevel7World, simulateSpatialDungeonDay,
  type Level7HeroProgress, type Level7Replay,
} from "../../src/game/level7Exploration.ts";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { SeededRandom } from "../../src/game/random.ts";
import { scheduleShopVisit } from "../../src/game/shopArrivals.ts";

function explorer(seed=7351, floor:1|2|3|4=1):AdventurerState {
  const base=generateAdventurer(1,seed).adventurer;
  return {...base,status:"exploring",floor};
}

test("Day 1 has ten persistent heroes, exactly three distinct shop visitors", () => {
  const state=createGameState();
  assert.equal(state.adventurers.length,10);
  assert.equal(new Set(state.adventurers.map(hero=>hero.id)).size,10);
  const visitors=state.adventurers.filter(hero=>hero.status==="at-shop");
  assert.equal(visitors.length,3);
  assert(visitors.every(hero=>hero.floor===5)); // CURRENT V.002 shop, pending cursed portal.
  assert(state.adventurers.slice(3).every(hero=>
    hero.floor<=4 && hero.status==="exploring"));
  assert.equal(state.events.filter(event=>event.type==="shop-arrival").length,3);
  for(const hero of state.adventurers){
    assert(hero.name && hero.role && hero.traits.negative);
    assert.equal(hero.health,hero.stats.maxHealth);
    assert.equal(hero.level,1);
    assert.equal(hero.xp,0);
    assert.deepEqual(hero.inventory,{bread:0,loot:0,healing:0});
    assert.deepEqual(hero.equipment,{weapon:null,armor:null});
  }
});

test("character generation, world layout and seeded simulations reproduce across saves", () => {
  const a=new SeededRandom(0),b=new SeededRandom(0);
  assert.deepEqual(generateAdventurer(1,a.state),generateAdventurer(1,b.state));
  assert.notDeepEqual(createGameState(1).adventurers,createGameState(2).adventurers);
  for(const seed of [-1,1.5,NaN,Infinity,0x100000000])
    assert.throws(()=>createGameState(seed),RangeError);
  for(const floor of [1,2,3,4] as const) {
    const layout=generateExpeditionLayout(7351,floor);
    assert.equal(layout.floor,floor);
    assert.equal(layout.width,19);
    const hero=explorer(7351,floor),world=emptyLevel7World();
    const first=simulateSpatialDungeonDay(hero,world,7351,2);
    assert.deepEqual(first,simulateSpatialDungeonDay(hero,world,7351,2));
    assert.deepEqual(world,emptyLevel7World(),"pure simulation must not mutate world");
    assert.equal(first.replay.floor,floor);
    assert.equal(first.replay.heroId,hero.id);
    assert(first.replay.steps.length>1);
    assert(first.world.heroes[0]?.visited.length>1 ||
      first.adventurer.status==="dead");
    assert(first.adventurer.health>=0&&
      first.adventurer.health<=hero.stats.maxHealth);
    assert.equal(first.adventurer.level,
      1+Math.floor(first.adventurer.xp/100));
    assert(first.adventurer.gold>=hero.gold);
    assert(first.adventurer.inventory.loot>=hero.inventory.loot);
    assert(first.replay.steps.every(step=>layout.tiles[step.z*layout.width+step.x]!=="wall"));
  }
});

test("real trap damage, not a death dice roll, can kill a weakened early-floor hero", () => {
  const layout=generateExpeditionLayout(7351,2);
  const trap=layout.features.find(site=>site.kind==="trap")!;
  const approach=dungeonNeighbors(layout,trap)[0];
  const trapCell=trap.z*layout.width+trap.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile!=="wall"&&i!==trapCell?[i]:[]);
  const hero={...explorer(7351,2),health:1};
  const world={
    resolvedFeatureIds:layout.features.filter(site=>site.id!==trap.id).map(site=>site.id),
    heroes:[{heroId:hero.id,...approach,visited}],
  };
  const step=simulateSpatialDungeonDay(hero,world,7351,3);
  assert.equal(step.adventurer.status,"dead");
  assert.equal(step.adventurer.health,0);
  assert(step.replay.steps.some(record=>
    record.action==="trap"&&record.featureId===trap.id));
  assert(step.replay.steps.some(record=>record.action==="death"));
  assert.deepEqual(simulateSpatialDungeonDay(hero,world,7351,3),step);
});

test("strategic choices respond to actual HP, equipment, loot and map knowledge", () => {
  const hero=explorer(7351,2);
  const progress:Level7HeroProgress={
    heroId:hero.id,x:1,z:1,visited:Array.from({length:26},(_,i)=>i+1),
  };
  const replay:Level7Replay={
    version:1,day:2,heroId:hero.id,floor:2,
    appearance:{role:hero.role,equipment:hero.equipment},
    steps:[{x:1,z:1,t:0,action:"enter",hp:hero.health}],
    encounters:[],outcome:"exploring",
  };
  assert.equal(chooseHeroDungeonDecision(hero,progress,replay).action,"descend");
  const injured={...hero,health:1};
  assert.deepEqual(chooseHeroDungeonDecision(injured,progress,replay),
    {goal:"resupply",action:"shop"});
  const loaded={...hero,inventory:{...hero.inventory,loot:3}};
  assert.equal(chooseHeroDungeonDecision(loaded,progress,replay).action,"shop");
  const floor4={...hero,floor:4 as const};
  assert.equal(chooseHeroDungeonDecision(floor4,progress,
    {...replay,floor:4}).action,"shop");
  const fresh={...hero,gold:3};
  assert.equal(chooseHeroDungeonDecision(fresh,
    {...progress,visited:[1]},{...replay,outcome:"exploring"}).action,"stay");
});

test("a spatial day resolves one genuine shared world and saves its sealed replay", () => {
  const first=createGameState(7351);
  const {state,events}=advanceDay(first);
  assert.equal(state.day,2);
  assert(events.some(e=>e.type==="dungeon-exploration"&&e.dungeonReplay));
  assert(!events.some(e=>e.type==="dungeon-outcome"),
    "retired Floor 1–4 dice path must never run in new campaigns");
  const worlds=state.earlyDungeonWorlds??[];
  assert(worlds.length>0&&worlds.length<=4);
  assert.deepEqual([...worlds.map(w=>w.floor)].sort((a,b)=>a-b),
    worlds.map(w=>w.floor));
  for(const e of events.filter(e=>e.type==="dungeon-exploration")) {
    assert(e.dungeonReplay);
    assert(e.dungeonReplay.floor>=1&&e.dungeonReplay.floor<=4);
    assert(e.dungeonReplay.steps.every(step=>Number.isFinite(step.hp)));
  }
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  assert.deepEqual(advanceDay(first),{state,events});
});

test("saved old v13 campaigns without early worlds still load and gain them on the next day", () => {
  const original=createGameState(7351);
  const {earlyDungeonWorlds:_unused,...old}=original;
  assert.deepEqual(parseSave(JSON.stringify(createSave(old))),old);
  const next=advanceDay(old).state;
  assert((next.earlyDungeonWorlds?.length??0)>0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(next))),next);
});

test("a confirmed shop visit does not re-roll purchases, and dead heroes cannot return", () => {
  const hero=explorer();
  const dead={...hero,status:"dead" as const,health:0};
  assert.deepEqual(scheduleShopVisit(dead,3,1),
    {adventurer:dead,events:[],rngState:1});
  const shopHero={...hero,status:"traveling" as const,floor:4 as const};
  const arrival=scheduleShopVisit(shopHero,3,1);
  assert.equal(arrival.adventurer.status,"at-shop");
  assert.equal(arrival.adventurer.floor,5);
  const departed=scheduleShopVisit(arrival.adventurer,4,1,true);
  assert.equal(departed.adventurer.status,"returning");
  assert.equal(departed.adventurer.floor,4);
  assert.equal(departed.events.length,1);
});

test("multi-day play and save/reload are deterministic with real shared encounters", () => {
  let a=createGameState(1234),b=createGameState(1234);
  for(let tick=0;tick<12;tick++){
    a=advanceDay(a).state;
    b=advanceDay(parseSave(JSON.stringify(createSave(b)))).state;
    assert.deepEqual(a,b);
    assert.equal(new Set(a.events.map(e=>e.id)).size,a.events.length);
    assert.equal(a.simulationVersion,18);
    assert(a.adventurers.filter(hero=>hero.status!=="dead").length<=20);
  }
  assert(a.events.some(e=>e.type==="dungeon-exploration"));
  assert(a.earlyDungeonWorlds?.some(entry=>entry.world.heroes.length>0));
});

test("multi-day populations remain bounded with persistent identities", () => {
  let state=createGameState(7351);
  const original=new Map(state.adventurers.map(hero=>[hero.id,hero]));
  for(let tick=0;tick<20;tick++){
    const before=state;
    const {state:next,events}=advanceDay(before);
    state=next;
    assert.equal(state.adventurers.length-before.adventurers.length,
      events.filter(e=>e.type==="influx").length);
    assert(state.adventurers.filter(h=>h.status!=="dead").length<=20);
    assert.equal(new Set(state.adventurers.map(h=>h.id)).size,state.adventurers.length);
    for(const hero of state.adventurers){
      assert(hero.health>=0&&hero.health<=hero.stats.maxHealth);
      const origin=original.get(hero.id);
      if(origin){
        assert.equal(hero.name,origin.name);
        assert.equal(hero.role,origin.role);
        assert.deepEqual(hero.traits,origin.traits);
      }
    }
  }
});

test("daily influx is capped and configurable without a lifetime budget", () => {
  let state=createGameState(1,{dailyInflux:50,maxActive:10});
  for(let tick=0;tick<20;tick++)state=advanceDay(state).state;
  assert(state.adventurers.filter(h=>h.status!=="dead").length<=10);
  assert(state.adventurers.length>=10);
  let zero=createGameState(1,{dailyInflux:0});
  for(let tick=0;tick<7;tick++)zero=advanceDay(zero).state;
  assert.equal(zero.adventurers.length,10);
  for(const config of [{dailyInflux:-1},{dailyInflux:0.5},{maxActive:9},
    {maxActive:101},{dailyInflux:Infinity}]){
    assert.throws(()=>createGameState(1,config),RangeError);
  }
});
