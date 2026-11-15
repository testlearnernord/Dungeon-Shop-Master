import {createStockedShopLayout as createShopLayout} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { replaceCounterPlacement } from "../../src/game/shopLayout.ts";
import {checkoutQueuePoints} from "../../src/game/checkoutQueue.ts";
import {createLevel5Room,excavateLevel5Cell} from "../../src/game/level5Room.ts";
import {ShopServiceSpots} from "../../src/game/shopServiceSpots.ts";
import {NPC_STATION_CLEARANCE} from "../../src/game/npcTraffic.ts";
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

test("a shelf browser reserves its precise arrival point as well as its shelf",()=>{
  const layout=createShopLayout(),room=createLevel5Room();
  const manager=new ShopServiceSpots();
  const shopper=manager.reserveShelfAccess("browser","shelf-2",2,
    start,layout,room);
  assert(shopper,"a stocked shelf should have an accessible front");
  assert.deepEqual(manager.claim("browser")?.point,shopper.point);
  assert.equal(manager.claim("browser")?.role,"shelf-browse");
  assert.equal(manager.shelfBusyFor("shelf-2","another"),true);

  // Reservation is spatial: a second role cannot claim the exact spot,
  // even if it otherwise owns a completely different service category.
  const conflicting=manager.reserve("buyer","checkout",start,layout,room,{
    checkoutTarget:shopper.point,
  });
  assert.equal(conflicting,null,"checkout must not steal a browsing position");

  const idle=manager.reserve("idle","idle",start,layout,room);
  assert(idle);
  assert(distance(idle.point,shopper.point)>=1.18-1e-6);
  manager.release("browser");
  assert.equal(manager.claim("browser"),null);
  assert.equal(manager.shelfBusyFor("shelf-2","another"),false);
  assert(manager.reserveShelfAccess("another","shelf-2",2,start,layout,room));
});

test("a busy shelf approach is not considered free just because the shelf ID is free",()=>{
  const layout=createShopLayout(),room=createLevel5Room();
  const manager=new ShopServiceSpots();
  const initial=manager.reserveShelfAccess("initial","shelf-1",2,
    start,layout,room);
  assert(initial);
  manager.release("initial");
  const blocked=manager.reserveShelfAccess("next","shelf-1",2,
    start,layout,room,{occupied:[initial.point]});
  assert(blocked===null||distance(blocked.point,initial.point)>=1.18-1e-6,
    "a physically occupied shelf access must not be reissued");
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

test("shelf slots on a moved modular shelf share one exclusive service owner",()=>{
  const spots=new ShopServiceSpots();
  const layout=createShopLayout();
  spots.configure(layout,createLevel5Room());
  assert.equal(spots.claimShelf("shelf-2","hero-a"),true);
  assert.equal(spots.claimShelf("shelf-2","hero-a"),true);
  assert.equal(spots.shelfBusyFor("shelf-2","hero-b"),true);
  assert.equal(spots.claimShelf("shelf-2","hero-b"),false);
  assert.equal(spots.claimShelf("shelf-1","hero-b"),true);
  spots.release("hero-a");
  assert.equal(spots.shelfBusyFor("shelf-2","hero-b"),false);
  assert.equal(spots.claimShelf("shelf-2","hero-b"),true);
  spots.clear();
  assert.equal(spots.shelfBusyFor("shelf-2","hero-c"),false);
});

test("adjacent buyers can claim successive single-file cashier stations",()=>{
  const layout=createShopLayout();
  const room=createLevel5Room();
  const positions=checkoutQueuePoints(layout,{x:0,z:-1},5,room);
  assert.equal(positions.length,5);
  for(let i=1;i<positions.length;i++)
    assert(distance(positions[i],positions[i-1])>=NPC_STATION_CLEARANCE,
      "queue step must satisfy the service reservation clearance");
  const spots=new ShopServiceSpots();
  for(let i=0;i<positions.length;i++){
    const claim=spots.reserve("buyer-"+i,"checkout",start,layout,room,{
      checkoutTarget:positions[i],
    });
    assert(claim,"buyer "+i+" should reserve an adjacent cashier station");
    assert.deepEqual(claim.point,positions[i]);
  }
  assert.equal(spots.snapshot().length,5);
});

test("moving a shelf browser to checkout atomically frees the old shelf",()=>{
  const layout=createShopLayout(),room=createLevel5Room();
  const spots=new ShopServiceSpots();
  const first=spots.reserveShelfAccess("shopper","shelf-1",2,start,layout,room);
  assert(first);
  assert.equal(spots.shelfBusyFor("shelf-1","next-shopper"),true);
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},1,room)[0];
  assert(checkout);
  const next=spots.reserve("shopper","checkout",start,layout,room,{
    checkoutTarget:checkout,
  });
  assert(next);
  assert.equal(spots.claim("shopper")?.role,"checkout");
  assert.equal(spots.shelfBusyFor("shelf-1","next-shopper"),false,
    "a buyer heading to the register must stop monopolizing an old shelf");
  assert(spots.reserveShelfAccess("next-shopper","shelf-1",2,start,layout,room));
  assert.equal(spots.snapshot().length,2,"one customer must never own two stations");
});
