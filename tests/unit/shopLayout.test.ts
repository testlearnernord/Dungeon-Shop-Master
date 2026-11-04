import assert from "node:assert/strict";
import test from "node:test";
import {
  createShopLayout, replaceShelfPlacement, rotateShelfOffset,
  shopLayoutProblem, shelfBounds, type ShelfPlacement,
} from "../../src/game/shopLayout.ts";
import { advanceDay, createGameState, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";

test("shop layout starts with two wall-mounted shelves with stable slot IDs",()=>{
  const state=createGameState(42);
  assert.equal(SIMULATION_VERSION,9);
  assert.deepEqual(state.shopLayout,createShopLayout());
  assert.equal(shopLayoutProblem(state.shopLayout),null);
  assert.equal(state.shopEconomy.slots.length,10);
  assert.equal(new Set(state.shopEconomy.slots.map(s=>s.id)).size,10);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  assert.notStrictEqual(createShopLayout(),createShopLayout());
});

test("moving one shelf is immutable, grid-bound and leaves all economy fields unchanged",()=>{
  const initial=createGameState();
  const proposal:ShelfPlacement={id:"shelf-1",x:-7,z:-0.25,rotation:0};
  const outcome=replaceShelfPlacement(initial.shopLayout,proposal);
  assert.equal(outcome.message,"Shelf placement saved.");
  assert.equal(outcome.layout.shelves[0].z,-0.25);
  assert.deepEqual(initial.shopLayout,createShopLayout());
  const store=new GameStore(initial);
  let notifications=0;
  store.subscribe(()=>notifications++);
  assert.equal(store.placeShelf(proposal),"Shelf placement saved.");
  assert.equal(notifications,1);
  assert.strictEqual(store.state.shopEconomy,initial.shopEconomy);
  assert.strictEqual(store.state.adventurers,initial.adventurers);
  assert.strictEqual(store.state.events,initial.events);
  assert.equal(store.placeShelf({id:"shelf-2",x:0,z:2,rotation:0}),
    "Keep the counter, entrances and visitor aisles clear.");
  assert.equal(notifications,1);
  assert.deepEqual(store.state.shopLayout.shelves[1],initial.shopLayout.shelves[1]);
  const after=advanceDay(store.state).state;
  assert.deepEqual(after.shopLayout,store.state.shopLayout);
  assert.deepEqual(parseSave(JSON.stringify(createSave(after))),after);
});

test("geometry accepts valid rotations but rejects walls, counter, walkways and collisions",()=>{
  const original=createShopLayout();
  const rotate=replaceShelfPlacement(original,{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(rotate.message,"Shelf placement saved.");
  assert.equal(shopLayoutProblem(rotate.layout),null);
  assert.deepEqual(rotateShelfOffset(1,2,0),{x:1,z:2});
  assert.deepEqual(rotateShelfOffset(1,2,1),{x:2,z:-1});
  assert.deepEqual(rotateShelfOffset(1,2,2),{x:-1,z:-2});
  assert.deepEqual(rotateShelfOffset(1,2,3),{x:-2,z:1});
  assert(shelfBounds(original.shelves[0]).maxX< -5.7);
  for(const invalid of [
    {id:"shelf-1",x:-7.25,z:0,rotation:0},
    {id:"shelf-1",x:0,z:2,rotation:0},
    {id:"shelf-1",x:7,z:0,rotation:2},
    {id:"shelf-1",x:-6.75,z:0,rotation:0},
    {id:"shelf-1",x:-6.9,z:0,rotation:0},
    {id:"shelf-1",x:-7,z:0,rotation:4},
    {id:"shelf-1",x:Infinity,z:0,rotation:0},
  ]){
    const proposed=replaceShelfPlacement(original,invalid as ShelfPlacement);
    assert.strictEqual(proposed.layout,original,JSON.stringify(invalid));
  }
  assert.match(shopLayoutProblem({shelves:[original.shelves[0],original.shelves[0]]})!,/IDs/);
  assert.match(shopLayoutProblem({shelves:[original.shelves[0]]})!,/two shelves/);
});

test("v8 save migration preserves heroes, RNG, past replays and every shelf slot",()=>{
  const prior=advanceDay(createGameState(7351)).state;
  const original=structuredClone(createSave(prior)) as any;
  original.simulationVersion=8;
  original.payload.simulationVersion=8;
  delete original.payload.shopLayout;
  const restored=parseSave(JSON.stringify(original));
  assert.equal(restored.simulationVersion,9);
  assert.deepEqual(restored.shopLayout,createShopLayout());
  assert.deepEqual(restored.shopEconomy,prior.shopEconomy);
  assert.deepEqual(restored.adventurers,prior.adventurers);
  assert.deepEqual(restored.events,prior.events);
  assert.equal(restored.rngState,prior.rngState);
  assert.deepEqual(parseSave(JSON.stringify(createSave(restored))),restored);
});

test("strict saves reject injected, incomplete or obstructing furniture geometry",()=>{
  const good=createSave(createGameState());
  const mutations:[string,(data:any)=>void][]=[
    ["shopLayout",(s)=>{delete s.shopLayout;}],
    ["shopLayout",(s)=>{s.shopLayout.extra="unrecognized";}],
    ["shopLayout",(s)=>{s.shopLayout.shelves[0].x=0;}],
    ["shopLayout",(s)=>{s.shopLayout.shelves[0].z=Infinity;}],
    ["shopLayout",(s)=>{s.shopLayout.shelves[0].rotation=0.5;}],
    ["shopLayout",(s)=>{s.shopLayout.shelves[0].id="shelf-2";}],
    ["shopLayout",(s)=>{s.shopLayout.shelves.push(s.shopLayout.shelves[0]);}],
  ];
  for(const [field,fn] of mutations) {
    const envelope=structuredClone(good) as any;
    fn(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),new RegExp(field));
  }
});
