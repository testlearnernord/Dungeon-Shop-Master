import assert from "node:assert/strict";
import test from "node:test";
import {createShopLayout,replaceShelfPlacement,rotateShelfOffset} from "../../src/game/shopLayout.ts";
import {isObstructed,pathToShopGoal,pathToShelfAccess,shopSegmentClear} from "../../src/game/shopperNavigation.ts";

const distance=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);

test("shelf approach stays on the actual stock face for both legacy shelves",()=>{
  const layout=createShopLayout();
  const origin={x:0,z:0};
  for(const shelf of layout.shelves){
    for(let index=0;index<5;index++){
      const route=pathToShelfAccess(origin,layout,shelf.id,index);
      assert(route,`slot ${shelf.id} index ${index} must be reachable`);
      const offset=rotateShelfOffset(1.75,index-2,shelf.rotation);
      const desired={x:shelf.x+offset.x,z:shelf.z+offset.z};
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
  for(let index=0;index<5;index++){
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
