import assert from "node:assert/strict";
import test from "node:test";
import {
  compactCounterBounds, COMPACT_COUNTER, counterOverlapsActor, createShopLayout, getCounterPlacement,
  replaceCounterPlacement, replaceShelfPlacement, rotateShelfOffset,
  shopLayoutProblem, shelfBounds, shelfOverlapsActor, type ShelfPlacement,
} from "../../src/game/shopLayout.ts";
import { advanceDay, createGameState, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";

test("shop layout starts with two wall-mounted shelves with stable slot IDs",()=>{
  const state=createGameState(42);
  assert.equal(SIMULATION_VERSION,11);
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
  delete original.payload.shopCarts;
  delete original.payload.shopDebts;
  const restored=parseSave(JSON.stringify(original));
  assert.equal(restored.simulationVersion,11);
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

test("occupied floor space blocks shelf placement even when static geometry is legal",()=>{
  const placement:ShelfPlacement={id:"shelf-1",x:0,z:-2,rotation:1};
  assert.equal(shopLayoutProblem(replaceShelfPlacement(createShopLayout(),placement).layout),null);
  assert.equal(shelfOverlapsActor(placement,{x:0,z:-2,radius:0.45}),true);
  assert.equal(shelfOverlapsActor(placement,{x:0,z:-4.6,radius:0.45}),false);
  assert.equal(shelfOverlapsActor(placement,{x:2.5,z:-2.5,radius:0.4}),true);
  assert.equal(shelfOverlapsActor(placement,{x:4,z:-2,radius:0.4}),false);
});


test("compact checkout candidate has deterministic quarter-turn clearance",()=>{
  const at={x:1,z:2,rotation:0 as const};
  assert.deepEqual(compactCounterBounds(at),{
    minX:1-COMPACT_COUNTER.clearanceWidth/2,
    maxX:1+COMPACT_COUNTER.clearanceWidth/2,
    minZ:2-COMPACT_COUNTER.clearanceDepth/2,
    maxZ:2+COMPACT_COUNTER.clearanceDepth/2,
  });
  const rotated=compactCounterBounds({...at,rotation:1 as const});
  assert.equal(rotated.maxX-rotated.minX,COMPACT_COUNTER.clearanceDepth);
  assert.equal(rotated.maxZ-rotated.minZ,COMPACT_COUNTER.clearanceWidth);
  assert.deepEqual(compactCounterBounds({...at,rotation:2 as const}),compactCounterBounds(at));
  assert.deepEqual(compactCounterBounds({...at,rotation:3 as const}),rotated);
  assert.deepEqual(createShopLayout().shelves.map(s=>s.id),["shelf-1","shelf-2"]);
});

test("existing saves gain a default counter without mutating their saved schema",()=>{
  const initial=createGameState(91);
  const legacy=JSON.stringify(createSave(initial));
  const loaded=parseSave(legacy);
  assert.deepEqual(loaded.shopLayout,initial.shopLayout);
  assert.equal(loaded.shopLayout.counter,undefined);
  assert.deepEqual(getCounterPlacement(loaded.shopLayout),{x:0,z:2.5,rotation:0});
  assert.deepEqual(createSave(loaded).payload.shopLayout,initial.shopLayout);
});

test("counter uses shelf editor commit flow and keeps inventory, sales and RNG intact",()=>{
  const state=createGameState(91);
  const store=new GameStore(state);
  let notifications=0;
  store.subscribe(()=>notifications++);
  const proposal={x:0,z:0,rotation:1 as const};
  assert.equal(store.placeCounter(proposal),"Counter placement saved.");
  assert.equal(notifications,1);
  assert.deepEqual(store.state.shopLayout.counter,proposal);
  assert.deepEqual(store.state.shopLayout.shelves,state.shopLayout.shelves);
  assert.strictEqual(store.state.shopEconomy,state.shopEconomy);
  assert.strictEqual(store.state.adventurers,state.adventurers);
  assert.strictEqual(store.state.events,state.events);
  assert.equal(store.state.rngState,state.rngState);
  assert.equal(store.placeCounter(proposal),"Counter placement saved.");
  assert.equal(notifications,1);
  const after=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(after.shopLayout.counter,proposal);
  assert.equal(shopLayoutProblem(after.shopLayout),null);
  assert.equal(counterOverlapsActor(proposal,{x:0,z:0,radius:0.4}),true);
  assert.equal(counterOverlapsActor(proposal,{x:4,z:0,radius:0.4}),false);
});

test("invalid counter moves leave previous game state and saved position unchanged",()=>{
  const original=createShopLayout();
  const invalid=[
    {x:0.1,z:0,rotation:0},
    {x:8,z:0,rotation:0},
    {x:0,z:-5,rotation:0},
    {x:4.5,z:0,rotation:0},
    {x:4,z:4,rotation:0},
    {x:0,z:4.5,rotation:0},
    {x:4,z:-5.5,rotation:0},
    {x:Infinity,z:0,rotation:0},
    {x:0,z:0,rotation:9},
  ];
  for(const candidate of invalid) {
    const result=replaceCounterPlacement(original,candidate as any);
    assert.strictEqual(result.layout,original,JSON.stringify(candidate));
    assert.notEqual(result.message,"Counter placement saved.");
  }
  const updated=replaceCounterPlacement(original,{x:0,z:0,rotation:0});
  assert.equal(updated.message,"Counter placement saved.");
  const forbiddenShelf=replaceShelfPlacement(updated.layout,{
    id:"shelf-1",x:0,z:-1,rotation:1,
  });
  assert.strictEqual(forbiddenShelf.layout,updated.layout);
  assert.match(forbiddenShelf.message,/counter/);
});

test("strict save loader rejects corrupt placed checkout transforms",()=>{
  const store=new GameStore();
  store.placeCounter({x:0,z:0,rotation:1});
  const saved=createSave(store.state);
  for(const damage of [
    (p:any)=>{p.x=0.125;},
    (p:any)=>{p.rotation=4;},
    (p:any)=>{p.x=100;},
    (p:any)=>{p.injected=true;},
  ]) {
    const envelope=structuredClone(saved) as any;
    damage(envelope.payload.shopLayout.counter);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),/shopLayout/);
  }
});

test("editor id never reaches persisted counter transform or autosave",()=>{
  const store=new GameStore(createGameState(91));
  const editorDraft={id:"counter" as const,x:0,z:2.25,rotation:1 as const};
  assert.equal(store.placeCounter(editorDraft),"Counter placement saved.");
  assert.deepEqual(store.state.shopLayout.counter,{x:0,z:2.25,rotation:1});
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).shopLayout.counter,
    {x:0,z:2.25,rotation:1});
  assert.equal(Object.hasOwn(store.state.shopLayout.counter!,"id"),false);
});
