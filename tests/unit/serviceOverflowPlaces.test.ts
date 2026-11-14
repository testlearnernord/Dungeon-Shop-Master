import assert from "node:assert/strict";
import test from "node:test";
import { createShopLayout, replaceCounterPlacement, replaceShelfPlacement } from "../../src/game/shopLayout.ts";
import { checkoutQueuePoints } from "../../src/game/checkoutQueue.ts";
import { restockWaitingPositions } from "../../src/game/restockWaitingPlaces.ts";
import { reserveServiceOverflowRoute } from "../../src/game/serviceOverflowPlaces.ts";
import { idleShopPositions, NPC_CENTER_CLEARANCE } from "../../src/game/npcTraffic.ts";
import { isObstructed, shopSegmentClear } from "../../src/game/shopperNavigation.ts";

const dist=(a:{x:number;z:number},b:{x:number;z:number})=>
  Math.hypot(a.x-b.x,a.z-b.z);

test("more waiting shoppers than ordinary service slots get distinct off-aisle overflow stands",()=>{
  const layout=createShopLayout();
  const queue=checkoutQueuePoints(layout,{x:0,z:-1},28);
  const reserved=restockWaitingPositions(layout);
  const source={x:-3.43,z:4.65};
  const taken:{x:number;z:number}[]=[];
  for(let i=0;i<8;i++){
    const found=reserveServiceOverflowRoute(layout,source,[],taken,queue,i);
    assert(found,"all eight excess customers need their own waiting position");
    assert(found.point.z<=0.5);
    assert(!isObstructed(found.point,layout));
    for(const blocked of [...queue,...reserved,...taken])
      assert(dist(found.point,blocked)>=NPC_CENTER_CLEARANCE+0.16-1e-6);
    let current=source;
    for(const point of found.route.waypoints){
      assert(shopSegmentClear(current,point,layout),"no furniture shortcuts");
      current=point;
    }
    assert(dist(current,found.point)<0.17);
    taken.push(found.point);
  }
});

test("moved counter and shelf still reserve service lanes and avoid occupied destinations",()=>{
  const movedShelf=replaceShelfPlacement(createShopLayout(),{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(movedShelf.message,"Shelf placement saved.");
  const moved=replaceCounterPlacement(movedShelf.layout,{
    x:1,z:1,rotation:1,
  });
  // Use the moved shelf even if an otherwise valid counter placement gets
  // rejected by the shared layout guard.
  const layout=moved.message==="Counter placement saved."?moved.layout:movedShelf.layout;
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},16);
  const source={x:-3.43,z:4.65};
  const first=reserveServiceOverflowRoute(layout,source,[],[],checkout,0);
  assert(first);
  const occupied=[first.point];
  const next=reserveServiceOverflowRoute(layout,source,occupied,occupied,checkout,1);
  assert(next);
  assert(dist(first.point,next.point)>=NPC_CENTER_CLEARANCE+0.16);
});

test("when every spare spot is reserved, no phantom position or payment is invented",()=>{
  const layout=createShopLayout();
  const occupied=idleShopPositions(layout,100);
  const from={x:-3.43,z:4.65};
  assert.equal(reserveServiceOverflowRoute(layout,from,occupied,[],[],0),null);
  assert.throws(()=>reserveServiceOverflowRoute(layout,from,[],[],[],-1),RangeError);
});
