import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonDownStair,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {chooseKnownReturnStep,chooseKnownRouteStep,emptyLevel7World}
  from "../../src/game/level7Exploration.ts";

test("seed 9321: climbing from below can discover a real portal route without fake map knowledge",()=>{
  const seed=9321,floor=2;
  const layout=generateExpeditionLayout(seed,floor);
  const down=dungeonDownStair(layout);
  const index=(p:{x:number;z:number})=>p.z*layout.width+p.x;
  let current={...down};
  const visited=[index(current)];
  assert.notDeepEqual(current,layout.entrance);
  assert.equal(chooseKnownRouteStep(layout,{heroId:"test",...current,visited},
    layout.entrance),null,"The floor's upper portal is initially UNKNOWN.");
  const initial=createGameState(seed);
  const hero=initial.adventurers[3];
  const state={...initial,
    adventurers:initial.adventurers.map(h=>h.id===hero.id?{
      ...h,floor:2 as const,status:"exploring" as const}:h),
    earlyDungeonWorlds:[{floor:2 as const,world:{
      ...emptyLevel7World(),heroes:[{heroId:hero.id,...current,visited:[...visited]}],
    }}],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state,
    "Legitimate arrival via lower stair must be saveable without inventing entrance knowledge.");
  // The hero can see only adjacent open cells and his actually visited path,
  // not the unknown shortest path through hidden rooms.
  for(let step=0;step<layout.width*layout.height*3;step++){
    if(index(current)===index(layout.entrance))break;
    const before={heroId:hero.id,...current,visited:[...visited]};
    const next=chooseKnownReturnStep(layout,before);
    assert(next,"A physical return must never teleport or vanish.");
    assert.deepEqual(chooseKnownReturnStep(layout,before),next);
    assert(dungeonNeighbors(layout,current).some(p=>p.x===next.x&&p.z===next.z),
      "Every return movement must cross exactly one real, connected edge.");
    current=next;
    if(!visited.includes(index(current)))visited.push(index(current));
  }
  assert.deepEqual(current,layout.entrance,"Connected exploration ultimately discovers the real portal.");
  assert.equal(chooseKnownReturnStep(layout,{
    heroId:hero.id,...current,visited}),null);
  const forged=structuredClone(createSave(state));
  const saved=forged.payload.earlyDungeonWorlds![0].world.heroes[0] as
    {x:number;z:number;visited:number[]};
  const other=dungeonNeighbors(layout,down)[0];
  saved.x=other.x;saved.z=other.z;saved.visited=[index(other)];
  assert.throws(()=>parseSave(JSON.stringify(forged)),/entrance or arrival stair/,
    "A random tile without any valid entry anchor remains an invalid save.");
});

test("off-duty heroes consume only their owned medicine, not phantom daily healing",()=>{
  const first=createGameState(7351,{dailyInflux:0,maxActive:10});
  const hero=first.adventurers[0];
  const wounded={...hero,
    status:"off-duty" as const,floor:5 as const,offDutyUntilDay:4,
    health:hero.stats.maxHealth-20,
    inventory:{...hero.inventory,healing:1,bread:1},
  };
  const store=new GameStore({...first,adventurers:first.adventurers.map(h=>
    h.id===hero.id?wounded:h)});
  store.enableLiveDungeon();
  store.endDay(); // second day of campaign; first full day away
  const day2=store.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(day2.status,"off-duty");
  assert.equal(day2.health,hero.stats.maxHealth-2);
  assert.equal(day2.inventory.healing,0);
  assert.equal(day2.inventory.bread,1);
  assert.equal(store.state.events.filter(e=>e.type==="healed"&&
    e.adventurerId===hero.id).length,1);
  store.endDay(); // one more away day, last two HP cost the bread
  const day3=store.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(day3.status,"off-duty");
  assert.equal(day3.health,hero.stats.maxHealth);
  assert.equal(day3.inventory.bread,0);
  store.endDay(); // returns only at day 4
  const day4=store.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(day4.status,"exploring");
  assert.equal(day4.health,hero.stats.maxHealth);
  assert.equal(day4.inventory.healing,0);
  assert.equal(day4.inventory.bread,0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});
