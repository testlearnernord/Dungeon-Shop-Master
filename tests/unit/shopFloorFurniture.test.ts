import {createStockedShopLayout as createShopLayout} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  FURNITURE_REGISTRY,shopFixtureBounds,shopFixtureTouches,
  shopFixtureBounds as bounds,shelfServicePoint,cashierServicePoint,
  turnShopOffset,pointTouchesShopBounds,SHELF_SLOT_COUNT,shelfSlotLocalZ,furnitureDefinition,
} from "../../src/game/furnitureRegistry.ts";
import { replaceShelfPlacement, replaceCounterPlacement, counterDockPoint, shelfBounds, compactCounterBounds, shopFloorFixtures,  } from "../../src/game/shopLayout.ts";
import {FURNITURE_CATALOG} from "../../src/game/furnitureBlueprint.ts";
import {classifyFurnitureMesh} from "../../src/game/furnitureSelection.ts";
import {shopFloorWalkable} from "../../src/game/shopWalkability.ts";
import {createShopRoomGeometry,excavateShopRoomCell} from "../../src/game/shopRoomGeometry.ts";
import {checkoutQueuePoints} from "../../src/game/checkoutQueue.ts";
import {isObstructed,pathToShopGoal,shopSegmentClear} from "../../src/game/shopperNavigation.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {advanceDay} from "../../src/game/gameState.ts";
import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);
const entrance={x:-3.43,z:4.65};

test("all quarter turns derive shop-floor placement and solid AABBs from registry",()=>{
  const p={x:1.25,z:-0.75,rotation:0 as 0|1|2|3};
  for(const kind of ["shelf","counter"] as const){
    const original=FURNITURE_REGISTRY[kind].footprint;
    const width=original.maxX-original.minX;
    const depth=original.maxZ-original.minZ;
    for(const rotation of [0,1,2,3] as const){
      const pose={...p,rotation};
      const box=bounds(kind,pose);
      near(box.maxX-box.minX,rotation%2===0?width:depth);
      near(box.maxZ-box.minZ,rotation%2===0?depth:width);
      const solid=shopFixtureBounds(kind,pose,"solid");
      const model=FURNITURE_REGISTRY[kind].solid;
      near(solid.maxX-solid.minX,
        rotation%2===0?model.maxX-model.minX:model.maxZ-model.minZ);
      const center={x:(solid.minX+solid.maxX)/2,z:(solid.minZ+solid.maxZ)/2};
      assert(shopFixtureTouches(kind,pose,center,0,"solid"));
      assert(pointTouchesShopBounds(solid,center,0));
    }
  }
});

test("the shelf and cashier's visible models, blueprints, focus and hitboxes have one definition",()=>{
  const layout=createShopLayout();
  const render=furnitureDefinition("shelf-1");
  assert.equal(render.width,FURNITURE_REGISTRY.shelf.width);
  assert.equal(render.depth,FURNITURE_REGISTRY.shelf.depth);
  assert.equal(render.height,FURNITURE_REGISTRY.shelf.height);
  assert.equal(FURNITURE_CATALOG.some(x=>x.id==="shelf-1"),false);
  assert.deepEqual(classifyFurnitureMesh("shelf-2-plank")?.bounds,
    FURNITURE_REGISTRY.shelf.focus);
  const counter=FURNITURE_CATALOG.find(x=>x.id==="counter")!;
  assert.equal(counter.width,FURNITURE_REGISTRY.counter.width);
  assert.equal(counter.depth,FURNITURE_REGISTRY.counter.depth);
  assert.equal(counter.height,FURNITURE_REGISTRY.counter.height);
  assert.deepEqual(classifyFurnitureMesh("counter-top")?.bounds,
    FURNITURE_REGISTRY.counter.focus);
  assert.deepEqual(compactCounterBounds(layout.counter!),bounds("counter",layout.counter!));
  for(const shelf of layout.shelves){
    assert.deepEqual(shelfBounds(shelf),bounds("shelf",shelf));
    for(let slot=0;slot<SHELF_SLOT_COUNT;slot++){
      const actual=shelfServicePoint(shelf,slot);
      const local=turnShopOffset(FURNITURE_REGISTRY.shelf.shelfService.outward,
        shelfSlotLocalZ(slot),shelf.rotation);
      assert.deepEqual(actual,{x:shelf.x+local.x,z:shelf.z+local.z});
    }
  }
  for(const rotation of [0,1,2,3] as const){
    const moved={...layout,counter:{x:0,z:0,rotation}};
    assert.deepEqual(counterDockPoint(moved,"customer"),
      cashierServicePoint(moved.counter,"customer"));
    assert.deepEqual(counterDockPoint(moved,"staff"),
      cashierServicePoint(moved.counter,"staff"));
  }
});

test("registered solid collision is the same for nav in original and excavated floor",()=>{
  const layout=createShopLayout(),room=createShopRoomGeometry();
  const fixtures=shopFloorFixtures(layout);
  assert.strictEqual(shopFloorFixtures(layout),fixtures,
    "do not rebuild furniture boxes in every BFS navigation cell");
  assert.deepEqual(fixtures.map(x=>x.id),["shelf-1","shelf-2","counter","recovered-goods-chest"]);
  for(const fixture of fixtures){
    const center={
      x:(fixture.solid.minX+fixture.solid.maxX)/2,
      z:(fixture.solid.minZ+fixture.solid.maxZ)/2,
    };
    assert.equal(shopFloorWalkable(center,room,layout),false);
    assert.equal(isObstructed(center,layout,room),true);
    assert.equal(isObstructed(center,layout),true);
  }
  const moved=replaceCounterPlacement(layout,{x:0,z:2.25,rotation:1});
  assert.equal(moved.message,"Counter placement saved.");
  assert.notStrictEqual(shopFloorFixtures(moved.layout),fixtures,
    "a new immutable layout must invalidate cached collision data");
  assert.equal(shopServiceReachabilityProblem(moved.layout,room),null);
  const customer=cashierServicePoint(moved.layout.counter!,"customer");
  assert(!isObstructed(customer,moved.layout,room));
  const route=pathToShopGoal(entrance,customer,moved.layout,room);
  assert(route);
  let current=entrance;
  for(const target of route.waypoints){
    assert(shopSegmentClear(current,target,moved.layout,room));
    current=target;
  }
  assert(distance(current,customer)<0.18);
});

test("new registry drives persisted shelf in mined wing while keeping trade decisions unchanged",()=>{
  const first=createGameState(7351);
  let room={...createShopRoomGeometry(),expansionTier:2};
  for(let x=8;x<=11;x++)for(let z=-6;z<=6;z++){
    const dug=excavateShopRoomCell(room,{x,z});
    assert(dug.ok);
    room=dug.room;
  }
  const store=new GameStore({...first,shopRoom:room});
  const moved={id:"shelf-2" as const,x:8.25,z:0,rotation:2 as const};
  assert.equal(store.previewFurniturePlacement(moved),null);
  assert.equal(store.placeFurniture(moved),"Shelf placement saved.");
  // Keep the checkout in the central shop while the shelf occupies the wing;
  // a separate excavation regression already moves the till into the wing.
  const counter={x:0,z:2.25,rotation:1 as const};
  assert.equal(store.previewFurniturePlacement({...counter,id:"counter"}),null);
  assert.equal(store.placeFurniture({id:"counter",...counter}),"Counter placement saved.");
  assert.equal(shopServiceReachabilityProblem(store.state.shopLayout,room),null);
  const service=shelfServicePoint(moved,2);
  assert(pathToShopGoal(entrance,service,store.state.shopLayout,room));
  const front=checkoutQueuePoints(store.state.shopLayout,entrance,1,room)[0];
  assert(front&&pathToShopGoal(service,front,store.state.shopLayout,room));
  const reloaded=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(reloaded.shopLayout,store.state.shopLayout);
  assert.deepEqual(reloaded.shopRoom,room);
  assert.deepEqual(advanceDay(store.state).state.shopEconomy,
    advanceDay({...first,shopRoom:room}).state.shopEconomy,
    "furniture geometry must not change the authoritative economy");
});
