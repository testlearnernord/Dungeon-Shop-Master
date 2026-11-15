import assert from "node:assert/strict";
import test from "node:test";
import {createShopLayout,replaceCounterPlacement} from "../../src/game/shopLayout.ts";
import {checkoutQueuePoints} from "../../src/game/checkoutQueue.ts";
import {createLevel5Room,excavateLevel5Cell} from "../../src/game/level5Room.ts";
import {ShopServiceSpots} from "../../src/game/shopServiceSpots.ts";
import {classifyFurnitureMesh} from "../../src/game/furnitureSelection.ts";

const distance=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);
const start={x:-3.43,z:4.65};

test("all customer service intents reserve exclusive actual reachable floor positions",()=>{
  const layout=createShopLayout(),room=createLevel5Room();
  const manager=new ShopServiceSpots();
  const stockout=manager.reserve("stockout","restock",start,layout,room);
  const begging=manager.reserve("beggar","credit",start,layout,room);
  assert(stockout,"missing-restock customer needs a real wait place");
  assert(begging,"unaffordable customer needs a different real wait place");
  assert(distance(stockout.point,begging.point)>1.02);
  assert.deepEqual(manager.claim("stockout")?.point,stockout.point);
  assert.equal(manager.claim("beggar")?.role,"credit");
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},1,room)[0];
  assert(checkout,"checkout must have a customer standing place");
  const paid=manager.reserve("buyer","checkout",start,layout,room,{
    checkoutTarget:checkout,
  });
  assert(paid);
  assert.deepEqual(paid.point,checkout);
  const stolen=manager.reserve("other","checkout",start,layout,room,{
    checkoutTarget:checkout,
  });
  assert.equal(stolen,null,"two buyers cannot own the same checkout point");
  const idle=manager.reserve("idle","idle",start,layout,room);
  assert(idle);
  const overflow=manager.reserve("overflow","overflow",start,layout,room);
  assert(overflow);
  const places=[stockout.point,begging.point,paid.point,idle.point,overflow.point];
  for(let i=0;i<places.length;i++)for(let j=i+1;j<places.length;j++)
    assert(distance(places[i],places[j])>1.01,"service roles overlap");
  assert.equal(manager.snapshot().length,5);
});

test("claims are released on departure and invalidated only by real room/furniture updates",()=>{
  const manager=new ShopServiceSpots(),layout=createShopLayout(),room=createLevel5Room();
  const first=manager.reserve("a","restock",start,layout,room);
  assert(first);
  manager.configure({...layout,shelves:layout.shelves.map(x=>({...x}))},room);
  assert.deepEqual(manager.claim("a")?.point,first.point,
    "new object identity with unchanged geometry must retain reservations");
  manager.release("a");
  assert.equal(manager.claim("a"),null);
  const reallocated=manager.reserve("b","restock",start,layout,room);
  assert.deepEqual(reallocated?.point,first.point);
  const moved=replaceCounterPlacement(layout,{x:0,z:2.25,rotation:1});
  assert.equal(moved.message,"Counter placement saved.");
  manager.configure(moved.layout,room);
  assert.equal(manager.claim("b"),null,"counter relocation invalidates earlier service sockets");
  const mined=excavateLevel5Cell({...room,expansionTier:1},{x:8,z:0});
  assert(mined.ok);
  manager.reserve("c","idle",start,moved.layout,room);
  manager.configure(moved.layout,mined.room);
  assert.equal(manager.claim("c"),null,"room topology updates invalidate reservations");
  manager.clear();
  assert.equal(manager.snapshot().length,0);
});

test("reserved shelf wait uses the moved shelf's access socket and never steals checkout",()=>{
  const layout=createShopLayout(),room=createLevel5Room();
  const service=new ShopServiceSpots();
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},1,room)[0];
  assert(checkout);
  const paid=service.reserve("pay","checkout",start,layout,room,{checkoutTarget:checkout});
  assert(paid);
  const shelf=layout.shelves[1];
  const waiting=service.reserve("wait","shelf-wait",start,layout,room,{
    shelfAccess:{x:shelf.x-1.75,z:shelf.z},
  });
  assert(waiting);
  assert(distance(waiting.point,checkout)>1.02);
  assert.equal(service.claim("wait")?.role,"shelf-wait");
  const blocked=service.reserve("another","idle",start,layout,room,{
    occupied:[waiting.point],
    destinations:[paid.point],
  });
  assert(blocked===null||distance(blocked.point,waiting.point)>1.02);
});

test("orange counter focus follows the actual counter body, not its old 2.5m clearance box",()=>{
  const model=classifyFurnitureMesh("cash-register");
  const body=classifyFurnitureMesh("checkout-counter");
  assert(model&&body);
  assert.equal(model.id,"counter");
  assert.deepEqual(model.bounds,body.bounds);
  assert.equal(model.bounds.width,1.55);
  assert.equal(model.bounds.depth,0.93);
  assert.equal(model.bounds.height,1.38);
});
