import assert from "node:assert/strict";
import test from "node:test";
import {GameStore} from "../../src/game/gameStore.ts";
import {advanceDay} from "../../src/game/gameState.ts";
import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import {createLevel5Room,excavateLevel5Cell,isValidLevel5Room} from "../../src/game/level5Room.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {restockWaitingPositions} from "../../src/game/restockWaitingPlaces.ts";
import {checkoutQueuePoints} from "../../src/game/checkoutQueue.ts";
import {ShopServiceSpots} from "../../src/game/shopServiceSpots.ts";
import {isObstructed,pathToShopGoal,shopSegmentClear} from "../../src/game/shopperNavigation.ts";
import {type ShopLayout} from "../../src/game/shopLayout.ts";
import {shelfServicePoint,SHELF_SLOT_COUNT} from "../../src/game/furnitureRegistry.ts";
import type {Level5Room} from "../../src/game/level5Room.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {getBedroomFurniture} from "../../src/game/bedroomFurniture.ts";

const entrance={x:-3.43,z:4.65},farEntrance={x:4.57,z:4.65};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);
function carveWing():Level5Room{
  let room:Level5Room={...createLevel5Room(),expansionTier:2};
  for(let x=8;x<=11;x++)for(let z=-6;z<=6;z++){
    const attempt=excavateLevel5Cell(room,{x,z});
    assert(attempt.ok,"all mined cells must be exposed: "+x+","+z);
    room=attempt.room;
  }
  assert(isValidLevel5Room(room));
  return room;
}
function assertRoute(layout:ShopLayout,room:Level5Room,
  from:{x:number;z:number},to:{x:number;z:number}){
  const route=pathToShopGoal(from,to,layout,room);
  assert(route,"unreachable "+JSON.stringify({from,to}));
  let previous=from;
  for(const point of route.waypoints){
    assert(!isObstructed(point,layout,room));
    assert(shopSegmentClear(previous,point,layout,room),
      "route crosses furniture or unmined rock");
    previous=point;
  }
  assert(distance(previous,to)<0.2,"route must reach the actual target");
}

test("connected excavated wing, moved shelf and counter preserve all customer services",()=>{
  const room=carveWing(),initial=createGameState(7351);
  const store=new GameStore({...initial,level5Room:room});
  const shelf={id:"shelf-2" as const,x:8.25,z:0,rotation:2 as const};
  assert.equal(store.previewShopPlacement(shelf),null);
  assert.equal(store.placeShelf(shelf),"Shelf placement saved.");
  const counter={id:"counter" as const,x:0,z:2.25,rotation:1 as const};
  assert.equal(store.previewShopPlacement(counter),null);
  assert.equal(store.placeCounter(counter),"Counter placement saved.");
  const layout=store.state.shopLayout;
  assert.equal(shopServiceReachabilityProblem(layout,room),null);
  const checkout=checkoutQueuePoints(layout,entrance,5,room);
  const requests=restockWaitingPositions(layout,room);
  assert(checkout.length>=1&&requests.length>=2);
  for(const door of [entrance,farEntrance]){
    assertRoute(layout,room,door,checkout[0]);
    for(const petition of requests.slice(0,2))assertRoute(layout,room,door,petition);
    for(const shelf of layout.shelves)for(let slot=0;slot<SHELF_SLOT_COUNT;slot++){
      const target=shelfServicePoint(shelf,slot);
      assertRoute(layout,room,door,target);
      assertRoute(layout,room,target,checkout[0]);
    }
  }
  const manager=new ShopServiceSpots();
  const a=manager.reserve("restock","restock",entrance,layout,room);
  const b=manager.reserve("beggar","credit",entrance,layout,room);
  assert(a&&b,"requests require simultaneous safe waiting capacity");
  // Roaming is only a LOCAL diversion from a settled request station. It
  // should not send a customer three rooms across the shop from the gate.
  const c=manager.reserve("roamer","roam",a.point,layout,room,{avoid:a.point});
  assert(distance(a.point,b.point)>=1.18);
  if(c){
    assert(distance(c.point,a.point)<=3.8);
    assert(distance(c.point,b.point)>=1.18);
  }else assert.equal(manager.claim("roamer"),null);
  assert.deepEqual(forecastShoppingIntents(store.state),
    forecastShoppingIntents({...initial,level5Room:room}));
  assert.deepEqual(advanceDay(store.state).state.shopEconomy,
    advanceDay({...initial,level5Room:room}).state.shopEconomy);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.level5Room,room);
  assert.deepEqual(saved.shopLayout,layout);
  assert.equal(shopServiceReachabilityProblem(saved.shopLayout,saved.level5Room),null);
});

test("bedroom, bed and board stay independent of retail navigation in an enlarged shop",()=>{
  const initial=createGameState(7351),room=carveWing();
  const store=new GameStore({...initial,level5Room:room});
  assert.equal(store.placeRosterBoard({x:-5,z:-6.45,rotation:2}),
    "Adventurer board placed.");
  assert.equal(store.placeBedroomFurniture({id:"desk",x:-2.25,z:-9.75,rotation:1}),
    "Bedroom furniture placed.");
  assert.equal(store.placeBedroomFurniture({id:"bed",x:0.75,z:-10,rotation:0}),
    "Bedroom furniture placed.");
  assert.equal(getBedroomFurniture(store.state.bedroomFurniture,"bed").z,-10);
  assert.equal(shopServiceReachabilityProblem(store.state.shopLayout,room),null);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.rosterBoard,store.state.rosterBoard);
  assert.deepEqual(saved.bedroomFurniture,store.state.bedroomFurniture);
  assert.deepEqual(saved.level5Room,room);
});
