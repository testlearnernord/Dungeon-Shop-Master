import {createStockedShopLayout as createShopLayout} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { replaceShelfPlacement } from "../../src/game/shopLayout.ts";
import {shelfServicePoint,SHELF_SLOT_COUNT} from "../../src/game/furnitureRegistry.ts";
import { createLevel5Room } from "../../src/game/level5Room.ts";
import {createShopRoutePlanner,isObstructed,pathToShopGoal,pathToShelfAccess,shopSegmentClear} from "../../src/game/shopperNavigation.ts";

const distance=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);

test("shelf approach stays on the actual face of compact placed shelves",()=>{
  const layout=createShopLayout();
  const origin={x:0,z:0};
  for(const shelf of layout.shelves){
    for(let index=0;index<SHELF_SLOT_COUNT;index++){
      const route=pathToShelfAccess(origin,layout,shelf.id,index);
      assert(route,`slot ${shelf.id} index ${index} must be reachable`);
      const desired=shelfServicePoint(shelf,index);
      const actual=route.waypoints.at(-1)??origin;
      assert(distance(actual,desired)<=0.85);
      assert(!isObstructed(actual,layout));
      let cursor=origin;
      for(const point of route.waypoints){
        assert(shopSegmentClear(cursor,point,layout),"must not shortcut through shelf");
        cursor=point;
      }
    }
  }
});

test("rotating a shelf rebuilds real routes to the moved stock slots",()=>{
  const original=createShopLayout();
  const replacement=replaceShelfPlacement(original,{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(replacement.message,"Shelf placement saved.");
  const origin={x:-3,z:0};
  for(let index=0;index<SHELF_SLOT_COUNT;index++){
    const route=pathToShelfAccess(origin,replacement.layout,"shelf-1",index);
    assert(route,"must approach a rotated shelf from reachable floor");
    const end=route.waypoints.at(-1)??origin;
    assert(!isObstructed(end,replacement.layout));
  }
});

test("a blocked nominal access point finds a nearby open place, not a fake snapped checkout",()=>{
  const shelves=createShopLayout().shelves;
  // Deliberately obstruct just the nominal point, modelling furniture moving
  // during customer navigation. The helper must preserve real collision checks.
  const layout={shelves,counter:{x:-4.5,z:0.45,rotation:0 as const}};
  const from={x:-2,z:-1};
  const nominal={x:-5.25,z:0};
  assert(isObstructed(nominal,layout));
  const route=pathToShelfAccess(from,layout,"shelf-1",2);
  assert(route,"a small lateral shift along the same shelf is accessible");
  const end=route.waypoints.at(-1)??from;
  assert(!isObstructed(end,layout));
  assert(distance(nominal,end)>0.17);
  assert(distance(nominal,end)<=0.85);
  let cursor=from;
  for(const waypoint of route.waypoints){
    assert(shopSegmentClear(cursor,waypoint,layout));
    cursor=waypoint;
  }
});

test("unreachable and invalid requests fail cleanly instead of inventing targets",()=>{
  const layout=createShopLayout();
  assert.equal(pathToShelfAccess({x:NaN,z:0},layout,"shelf-1",2),null);
  assert.equal(pathToShelfAccess({x:0,z:0},layout,"shelf-1",-1),null);
  assert.equal(pathToShelfAccess({x:0,z:0},layout,"shelf-2",5),null);
  // This is deliberately blocked: no fake success from a legal grid snap.
  const source={x:0,z:0};
  assert(pathToShopGoal(source,source,layout));
});

test("batch planner preserves the exact paths for both entrances, every shelf slot and invalid targets",()=>{
  const room=createLevel5Room(),layout=createShopLayout();
  const route=createShopRoutePlanner(layout,room);
  const targets=layout.shelves.flatMap(shelf=>Array.from({length:SHELF_SLOT_COUNT},
    (_,i)=>shelfServicePoint(shelf,i)));
  targets.push({x:0,z:0},{x:-3.43,z:4.65},{x:999,z:999});
  for(const start of [{x:-3.43,z:4.65},{x:4.57,z:4.65}]){
    for(const goal of targets){
      assert.deepEqual(route(start,goal),pathToShopGoal(start,goal,layout,room),
        "shared grid must keep the complete one-shot path unchanged");
    }
  }
  assert.equal(route({x:NaN,z:0},{x:0,z:0}),null);
  const moved=replaceShelfPlacement(layout,{id:"shelf-1",x:0,z:-2,rotation:1},room);
  assert.equal(moved.message,"Shelf placement saved.");
  const fresh=createShopRoutePlanner(moved.layout,room);
  const goal=shelfServicePoint(moved.layout.shelves[0],2);
  assert.deepEqual(fresh({x:-3,z:0},goal),
    pathToShopGoal({x:-3,z:0},goal,moved.layout,room));
  assert.deepEqual(route({x:-3,z:0},goal),
    pathToShopGoal({x:-3,z:0},goal,layout,room),
    "old batch observes only its original immutable topology");
});

test("clear-floor buyers walk diagonally rather than following a raster staircase",()=>{
  const room=createLevel5Room(),layout=createShopLayout();
  const from={x:-2,z:0},to={x:2,z:2};
  const direct=pathToShopGoal(from,to,layout,room);
  assert(direct);
  assert.deepEqual(direct.waypoints,[to]);
  const placed=replaceShelfPlacement(layout,
    {id:"shelf-1",x:0,z:0,rotation:0},room);
  assert.equal(placed.message,"Shelf placement saved.");
  const detour=pathToShopGoal({x:-3,z:0},{x:3,z:0},placed.layout,room);
  assert(detour);
  let cursor={x:-3,z:0};
  for(const point of detour.waypoints){
    assert(shopSegmentClear(cursor,point,placed.layout,room),
      "smoothing may not shortcut through the shelf collider");
    cursor=point;
  }
  assert(distance(cursor,{x:3,z:0})<.17);
});
