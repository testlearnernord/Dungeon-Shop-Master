import assert from "node:assert/strict";
import test from "node:test";
import { CHECKOUT_COUNTER, checkoutCounterBounds, createShopLayout, replaceCounterPlacement } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear } from "../../src/game/shopperNavigation.ts";
import { gateTravelLane, idleShopPositions, interruptedDepartureRoute, nextEntranceSpawnZ } from "../../src/game/npcTraffic.ts";

test("level 4 and level 6 entrances use distinct inbound and outbound lanes",()=>{
  for(const gate of ["level4","level6"] as const){
    const entering=gateTravelLane(gate,"entering");
    const leaving=gateTravelLane(gate,"leaving");
    const center=gate==="level4"?-4:4;
    assert(Math.abs(entering-leaving)>0.54);
    assert(Math.abs(entering-center)<0.8);
    assert(Math.abs(leaving-center)<0.8);
  }
});

test("burst arrivals get non-overlapping spawns, without crossing the corridor walls",()=>{
  const x=gateTravelLane("level4","entering");
  const occupied:{x:number;z:number}[]=[];
  for(let i=0;i<24;i++){
    const z=nextEntranceSpawnZ(x,occupied);
    for(const person of occupied)
      assert(Math.hypot(person.x-x,person.z-z)>=0.7);
    occupied.push({x,z});
  }
  assert.equal(occupied[0].z,13);
  assert(occupied[23].z>occupied[0].z);
});

test("interrupted departures change lanes only outside the corridor walls",()=>{
  for(const gate of ["level4","level6"] as const){
    const outgoing=gateTravelLane(gate,"leaving");
    const incoming=gateTravelLane(gate,"entering");
    const points=interruptedDepartureRoute(gate,{x:outgoing,z:9},6,13);
    assert.deepEqual(points,[
      {x:outgoing,z:14},
      {x:incoming,z:14},
      {x:incoming,z:6},
    ]);
    assert.deepEqual(interruptedDepartureRoute(gate,{x:outgoing,z:5},6,13),[
      {x:incoming,z:6},
    ]);
  }
});

test("up to 100 idle visitors get unique walkable reachable positions",()=>{
  const layout=createShopLayout();
  const spots=idleShopPositions(layout,100);
  assert.equal(spots.length,100,"must support the configured 100 active heroes");
  for(let i=0;i<spots.length;i++){
    const point=spots[i];
    assert(point.z<3,"idle NPCs must not block the doorway");
    assert(!isObstructed(point,layout));
    for(let j=0;j<i;j++)assert(Math.hypot(point.x-spots[j].x,point.z-spots[j].z)>=0.7);
    const route=pathToShopGoal({x:gateTravelLane("level4","entering"),z:6},point,layout);
    assert(route,"idle location should be reachable from the level 4 entrance");
  }
});

test("moved shelf never snaps two waiting visitors onto the same destination",()=>{
  const layout=createShopLayout();
  const moved={shelves:layout.shelves.map(shelf=>shelf.id==="shelf-1"
    ?{...shelf,x:0,z:-2,rotation:1 as const}:shelf)};
  const spots=idleShopPositions(moved,100);
  assert(spots.length>=60,"layout should retain useful idle capacity");
  for(let i=0;i<spots.length;i++){
    assert(!isObstructed(spots[i],moved));
    for(let j=0;j<i;j++)
      assert(Math.hypot(spots[i].x-spots[j].x,spots[i].z-spots[j].z)>=0.7);
  }
});

test("shared checkout geometry preserves legacy furniture, collision and save layout",()=>{
  const c=CHECKOUT_COUNTER;
  assert.equal(c.x,0);
  assert.equal(c.z,2.45);
  assert.equal(c.bodyWidth,3.5);
  assert.equal(c.bodyDepth,1.15);
  assert.deepEqual(checkoutCounterBounds(),{
    minX:-2.25,maxX:2.25,minZ:1.15,maxZ:3.45,
  });
  const layout=createShopLayout();
  assert(isObstructed({x:0,z:2.45},layout));
  assert(!isObstructed({x:0,z:1.4},layout));
  assert(!isObstructed({x:0,z:3.4},layout));
  assert.deepEqual(Object.keys(layout),["shelves"],"existing saves stay unchanged");
});

test("departure step detects a newly moved counter before walking through it",()=>{
  const legacy=createShopLayout();
  const from={x:0,z:-2.5};
  const to={x:0,z:-2.0};
  assert.equal(shopSegmentClear(from,to,legacy),true);
  const moved=replaceCounterPlacement(legacy,{x:0,z:-1.25,rotation:1});
  assert.equal(moved.message,"Counter placement saved.");
  assert.equal(shopSegmentClear(from,to,moved.layout),false);
  assert.equal(isObstructed(to,moved.layout),true);
  // A valid alternative exit route must still exist around the new obstacle.
  const route=pathToShopGoal({x:0,z:-2.5},{x:-3.5,z:3},moved.layout);
  assert.ok(route);
  for(let i=1;i<route!.waypoints.length;i++)
    assert(shopSegmentClear(route!.waypoints[i-1],route!.waypoints[i],moved.layout));
});

test("departure collision sampling clips corridor crossing to indoor bounds",()=>{
  const layout=createShopLayout();
  const start={x:-3.5,z:6.75};
  const end={x:-3.5,z:6.54};
  assert.equal(shopSegmentClear(start,end,layout),false,
    "outdoor start is intentionally outside indoor collision bounds");
  const fraction=(start.z-6.6)/(start.z-end.z);
  const clipped={x:start.x+(end.x-start.x)*fraction,z:6.6};
  assert.equal(shopSegmentClear(clipped,end,layout),true,
    "crossing into the shop must not trap a departing visitor");
});
