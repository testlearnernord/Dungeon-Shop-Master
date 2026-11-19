import {createStockedShopLayout,createStockedShopState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {compactCounterBounds, counterOverlapsActor, createShopLayout, getCounterPlacement,
  counterDockPoint,isAtCounterStaffDock,NEW_GAME_COUNTER_PLACEMENT,
  replaceCounterPlacement, replaceShelfPlacement,
  shopLayoutProblem, shelfBounds, shelfOverlapsActor, type ShelfPlacement} from "../../src/game/shopLayout.ts";
import { shopFurnitureDefinition,turnShopOffset } from "../../src/game/furnitureRegistry.ts";
import { advanceDay, createGameState, SIMULATION_VERSION } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { GameStore } from "../../src/game/gameStore.ts";
import { shopServiceReachabilityProblem } from "../../src/game/shopServiceReachability.ts";

test("new game starts with an empty sales floor and no display inventory",()=>{
  const state=createGameState(42);
  assert.equal(SIMULATION_VERSION, 17);
  assert.deepEqual(state.shopLayout,createShopLayout());
  assert.equal(shopLayoutProblem(state.shopLayout),null);
  assert.equal(state.shopEconomy.slots.length,0);
  assert.deepEqual(state.shopLayout.shelves,[]);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  assert.notStrictEqual(createShopLayout(),createShopLayout());
});

test("moving one shelf is immutable, grid-bound and leaves all economy fields unchanged",()=>{
  const initial=createStockedShopState();
  const proposal:ShelfPlacement={id:"shelf-1",x:-7,z:-0.25,rotation:0};
  const outcome=replaceShelfPlacement(initial.shopLayout,proposal);
  assert.equal(outcome.message,"Shelf placement saved.");
  assert.equal(outcome.layout.shelves[0].z,-0.25);
  assert.deepEqual(initial.shopLayout,createStockedShopLayout());
  const store=new GameStore(initial);
  let notifications=0;
  store.subscribe(()=>notifications++);
  assert.equal(store.placeFurniture(proposal),"Shelf placement saved.");
  assert.equal(notifications,1);
  assert.deepEqual(store.state.shopEconomy.slots,initial.shopEconomy.slots);
  assert.equal(store.state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.strictEqual(store.state.adventurers,initial.adventurers);
  assert.strictEqual(store.state.events,initial.events);
  assert.equal(store.placeFurniture({id:"shelf-2",x:0,z:2,rotation:0}),
    "Keep the counter, entrances and visitor aisles clear.");
  assert.equal(notifications,1);
  assert.deepEqual(store.state.shopLayout.shelves[1],initial.shopLayout.shelves[1]);
  const after=advanceDay(store.state).state;
  assert.deepEqual(after.shopLayout,store.state.shopLayout);
  assert.deepEqual(parseSave(JSON.stringify(createSave(after))),after);
});

test("geometry accepts valid rotations but rejects walls, counter, walkways and collisions",()=>{
  const original=createStockedShopLayout();
  const rotate=replaceShelfPlacement(original,{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(rotate.message,"Shelf placement saved.");
  assert.equal(shopLayoutProblem(rotate.layout),null);
  assert.deepEqual(turnShopOffset(1,2,0),{x:1,z:2});
  assert.deepEqual(turnShopOffset(1,2,1),{x:2,z:-1});
  assert.deepEqual(turnShopOffset(1,2,2),{x:-1,z:-2});
  assert.deepEqual(turnShopOffset(1,2,3),{x:-2,z:1});
  assert(shelfBounds(original.shelves[0]).maxX< -5.7);
  for(const invalid of [
    {id:"shelf-1",x:-7.25,z:0,rotation:0},
    {id:"shelf-1",x:0,z:2,rotation:0},
    {id:"shelf-1",x:7,z:0,rotation:2},
    {id:"shelf-1",x:-6.9,z:0,rotation:0},
    {id:"shelf-1",x:-7,z:0,rotation:4},
    {id:"shelf-1",x:Infinity,z:0,rotation:0},
  ]){
    const proposed=replaceShelfPlacement(original,invalid as ShelfPlacement);
    assert.strictEqual(proposed.layout,original,JSON.stringify(invalid));
  }
  assert.match(shopLayoutProblem({counter:original.counter,
    shelves:[original.shelves[0],original.shelves[0]]})!,/IDs/);
  assert.equal(shopLayoutProblem({counter:original.counter,
    shelves:[original.shelves[0]]}),null);
});

test("side-aisle placements are decided by actual clearance and reachable routes",()=>{
  const layout=createStockedShopLayout();
  const shelf=replaceShelfPlacement(layout,{
    id:"shelf-1",x:-6.75,z:0,rotation:0,
  });
  assert.equal(shelf.message,"Shelf placement saved.");
  assert.equal(shopServiceReachabilityProblem(shelf.layout),null);
  // A counter may enter the former right-side no-go strip, provided its
  // customer and staff sockets still leave the nearby shelf accessible.
  const cashier=replaceCounterPlacement(layout,{x:3.5,z:0,rotation:0});
  assert.equal(cashier.message,"Counter placement saved.");
  assert.equal(shopServiceReachabilityProblem(cashier.layout),null);
  assert.equal(new GameStore().previewFurniturePlacement({
    id:"counter",x:3.5,z:0,rotation:0,
  }),null);
  // Not everything near the same wall is okay: farther right blocks the
  // actual shelf face, which must remain a rejected placement.
  const blocked=replaceCounterPlacement(layout,{x:5.5,z:0,rotation:0});
  assert.notEqual(blocked.message,"Counter placement saved.");
  assert.strictEqual(blocked.layout,layout,"counter cannot overlap an actual small shelf");
});

test("strict saves reject injected, incomplete or obstructing furniture geometry",()=>{
  const good=createSave(createStockedShopState());
  const mutations:[string,(data:any)=>void][]=[
    ["shopLayout",(s)=>{delete s.shopLayout;}],
    ["shopLayout",(s)=>{delete s.shopLayout.counter;}],
    ["level5Room",(s)=>{delete s.level5Room;}],
    ["bedroomFurniture",(s)=>{delete s.bedroomFurniture;}],
    ["rosterBoard",(s)=>{delete s.rosterBoard;}],
    ["shopLayout",(s)=>{s.shopLayout.extra="unrecognized";}],
    ["shopLayout",(s)=>{s.shopLayout.shelves[0].x=7;}],
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
  assert.equal(shopLayoutProblem(replaceShelfPlacement(createStockedShopLayout(),placement).layout),null);
  assert.equal(shelfOverlapsActor(placement,{x:0,z:-2,radius:0.45}),true);
  assert.equal(shelfOverlapsActor(placement,{x:0,z:-4.6,radius:0.45}),false);
  assert.equal(shelfOverlapsActor(placement,{x:1.3,z:-2.5,radius:0.4}),true);
  assert.equal(shelfOverlapsActor(placement,{x:4,z:-2,radius:0.4}),false);
});


test("compact checkout candidate has deterministic quarter-turn clearance",()=>{
  const at={x:1,z:2,rotation:0 as const};
  const footprint=shopFurnitureDefinition("counter").footprint;
  assert.deepEqual(compactCounterBounds(at),{
    minX:1+footprint.minX,maxX:1+footprint.maxX,
    minZ:2+footprint.minZ,maxZ:2+footprint.maxZ,
  });
  const rotated=compactCounterBounds({...at,rotation:1 as const});
  assert.ok(Math.abs(rotated.maxX-rotated.minX-(shopFurnitureDefinition("counter").footprint.maxZ-shopFurnitureDefinition("counter").footprint.minZ))<1e-9);
  assert.ok(Math.abs(rotated.maxZ-rotated.minZ-(shopFurnitureDefinition("counter").footprint.maxX-shopFurnitureDefinition("counter").footprint.minX))<1e-9);
  assert.deepEqual(compactCounterBounds({...at,rotation:2 as const}),compactCounterBounds(at));
  assert.deepEqual(compactCounterBounds({...at,rotation:3 as const}),rotated);
  assert.deepEqual(createStockedShopLayout().shelves.map(s=>s.id),["shelf-1","shelf-2"]);
});

test("current v13 shop layouts require and preserve their counter transform",()=>{
  const initial=createGameState(91);
  const serialized=JSON.stringify(createSave(initial));
  const loaded=parseSave(serialized);
  assert.deepEqual(loaded.shopLayout,initial.shopLayout);
  assert.deepEqual(loaded.shopLayout.counter,
    {x:-4.25,z:-4.5,rotation:3});
  assert.deepEqual(getCounterPlacement(loaded.shopLayout),NEW_GAME_COUNTER_PLACEMENT);
  assert.deepEqual(createSave(loaded).payload.shopLayout,initial.shopLayout);
});

test("counter uses shelf editor commit flow and keeps inventory, sales and RNG intact",()=>{
  const state=createGameState(91);
  const store=new GameStore(state);
  let notifications=0;
  store.subscribe(()=>notifications++);
  const proposal={x:0,z:0,rotation:1 as const};
  assert.equal(store.placeFurniture({id:"counter",...proposal}),"Counter placement saved.");
  assert.equal(notifications,1);
  assert.deepEqual(store.state.shopLayout.counter,proposal);
  assert.deepEqual(store.state.shopLayout.shelves,state.shopLayout.shelves);
  assert.strictEqual(store.state.shopEconomy,state.shopEconomy);
  assert.strictEqual(store.state.adventurers,state.adventurers);
  assert.strictEqual(store.state.events,state.events);
  assert.equal(store.state.rngState,state.rngState);
  assert.equal(store.placeFurniture({id:"counter",...proposal}),"Counter placement saved.");
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
  store.placeFurniture({id:"counter",...{x:0,z:0,rotation:1}});
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
  assert.equal(store.placeFurniture(editorDraft),"Counter placement saved.");
  assert.deepEqual(store.state.shopLayout.counter,{x:0,z:2.25,rotation:1});
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).shopLayout.counter,
    {x:0,z:2.25,rotation:1});
  assert.equal(Object.hasOwn(store.state.shopLayout.counter!,"id"),false);
});

test("new-game corner counter keeps distinct visitor and staff docking sides",()=>{
  const layout=createShopLayout();
  assert.deepEqual(layout.counter,NEW_GAME_COUNTER_PLACEMENT);
  assert.equal(shopLayoutProblem(layout),null);
  assert(shopFurnitureDefinition("counter").body.width<1.5);
  assert(shopFurnitureDefinition("counter").focus.depth<1);
  const staff=counterDockPoint(layout,"staff");
  const customer=counterDockPoint(layout,"customer");
  assert(staff.x<layout.counter!.x,"staff stands toward the side wall");
  assert(customer.x>layout.counter!.x,"customers approach from the shop");
  assert(Math.hypot(staff.x-customer.x,staff.z-customer.z)>2);
  assert.equal(isAtCounterStaffDock(layout,staff),true);
  assert.equal(isAtCounterStaffDock(layout,customer),false);
  assert.equal(isAtCounterStaffDock(layout,{x:0,z:0}),false);
  for(const rotation of [0,1,2,3] as const){
    const moved={...layout,counter:{x:0,z:0,rotation}};
    const a=counterDockPoint(moved,"staff");
    const b=counterDockPoint(moved,"customer");
    assert.equal(isAtCounterStaffDock(moved,a),true);
    assert.equal(isAtCounterStaffDock(moved,b),false);
  }
});
