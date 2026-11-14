import assert from "node:assert/strict";
import test from "node:test";
import { CHECKOUT_COUNTER, checkoutCounterBounds, createShopLayout, replaceCounterPlacement } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear } from "../../src/game/shopperNavigation.ts";
import { ENTRANCE_STAGING_Z, ENTRANCE_SPAWN_HEADWAY, NPC_CENTER_CLEARANCE, NPC_SOFT_PASS_AFTER_SECONDS, NPC_GATE_SOFT_PASS_AFTER_SECONDS, inGateTrafficThroat, NPC_FINAL_WAYPOINT_RADIUS, GATE_INNER_HOLD_Z, GATE_OUTER_HOLD_Z, canFinishShopWaypoint, shopCrowdStep, crowdSafeStep, entranceApproachRoute, gateFlowDirection, mustYieldAtGate, gateTravelLane, idleShopPositions, idleShopSpotPriority, idleShopperBlocksRoute, interruptedDepartureRoute, nextEntranceSpawnZ, crowdStallSeconds, canYieldShopperSpot,
} from "../../src/game/npcTraffic.ts";

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
      assert(Math.hypot(person.x-x,person.z-z)>=NPC_CENTER_CLEARANCE-1e-6);
    occupied.push({x,z});
  }
  assert.equal(occupied[0].z,13);
  for(let i=1;i<occupied.length;i++)
    assert(occupied[i].z-occupied[i-1].z>=ENTRANCE_SPAWN_HEADWAY-1e-6,
      "arrival bursts require at least one full NPC gap, not shoulder overlap");
  assert(ENTRANCE_SPAWN_HEADWAY>NPC_CENTER_CLEARANCE);
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
    for(let j=0;j<i;j++)assert(Math.hypot(point.x-spots[j].x,point.z-spots[j].z)>=NPC_CENTER_CLEARANCE-1e-6);
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
      assert(Math.hypot(spots[i].x-spots[j].x,spots[i].z-spots[j].z)>=NPC_CENTER_CLEARANCE-1e-6);
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

test("crowd steering avoids occupied segments and holds the doorway lane",()=>{
  const start={x:0,z:0},goal={x:3,z:0},neighbour={x:1.04,z:0};
  const detour=crowdSafeStep(start,goal,[neighbour],0.2,()=>true);
  assert.ok(detour,"Indoor shoppers should steer past each other");
  assert(Math.hypot(detour.x-neighbour.x,detour.z-neighbour.z)>=NPC_CENTER_CLEARANCE-1e-6);
  assert.equal(crowdSafeStep(start,goal,[neighbour],0.2,()=>true,false),null,
    "In a narrow gate wait, do not cross lanes");
  assert.equal(crowdSafeStep(start,goal,[neighbour],0.2,()=>false),null);
});

test("collision checking covers the entire movement segment",()=>{
  const from={x:0,z:0},goal={x:4,z:0},other={x:0.6,z:0};
  assert.equal(crowdSafeStep(from,goal,[other],3,()=>true,false),null,
    "A long step must not tunnel through another hero");
  const escape=crowdSafeStep(from,goal,[other],0.2,()=>true);
  if(escape)assert(Math.hypot(escape.x-other.x,escape.z-other.z)>
    Math.hypot(from.x-other.x,from.z-other.z));
});

test("an already-indoor returning shopper must never route back through the entrance",()=>{
  const gate="level4";
  const from={x:-0.6,z:1.0};
  assert.deepEqual(entranceApproachRoute(gate,from,false,6,13),[],
    "day tick must preserve the current indoor position rather than block arrivals");
  assert.deepEqual(entranceApproachRoute(gate,{x:-5,z:-0.4},false,6,13),[]);
  assert.deepEqual(entranceApproachRoute(gate,{x:-4.57,z:6.24},false,6,13),[]);
});

test("new and interrupted outside visitors clear the shop entrance before browsing",()=>{
  const entering=gateTravelLane("level4","entering");
  const newRoute=entranceApproachRoute("level4",{x:entering,z:13},true,6,13);
  assert.deepEqual(newRoute,[
    {x:entering,z:6},
    {x:entering,z:ENTRANCE_STAGING_Z},
  ]);
  assert(ENTRANCE_STAGING_Z<5.0&&ENTRANCE_STAGING_Z>3.5);
  const interrupted=entranceApproachRoute("level4",{x:-3.43,z:9},false,6,13);
  assert.deepEqual(interrupted,[
    {x:-3.43,z:14},
    {x:entering,z:14},
    {x:entering,z:6},
    {x:entering,z:ENTRANCE_STAGING_Z},
  ]);
  const level6=gateTravelLane("level6","entering");
  assert.deepEqual(entranceApproachRoute("level6",{x:level6,z:13},true,6,13).at(-1),
    {x:level6,z:ENTRANCE_STAGING_Z});
});

test("an incoming visitor already in the Level 4 corridor holds departing customers inside",()=>{
  const entering={gate:"level4" as const,phase:"entering" as const,
    x:gateTravelLane("level4","entering"),z:8};
  const leaving={gate:"level4" as const,phase:"leaving" as const,
    x:gateTravelLane("level4","leaving"),z:5.7};
  const direction=gateFlowDirection("level4",[entering,leaving]);
  assert.equal(direction,"entering");
  assert.equal(mustYieldAtGate(leaving,direction),true);
  assert.equal(mustYieldAtGate(entering,direction),false);
  // The first visitor has now cleared the entrance into the shop.
  assert.equal(gateFlowDirection("level4",[
    {...entering,z:4.2},leaving,
  ]),"leaving");
});

test("departing Level 4 heroes in the throat hold new arrivals outside",()=>{
  const leaving={gate:"level4" as const,phase:"leaving" as const,
    x:gateTravelLane("level4","leaving"),z:8.2};
  const entering={gate:"level4" as const,phase:"entering" as const,
    x:gateTravelLane("level4","entering"),z:13};
  assert.equal(gateFlowDirection("level4",[leaving,entering]),"leaving");
  assert(mustYieldAtGate(entering,"leaving"));
  assert(!mustYieldAtGate(leaving,"leaving"));
  assert.equal(gateFlowDirection("level4",[
    {...leaving,z:13.3},entering,
  ]),"entering","once a departure is past the gate, queued buyers may enter");
});

test("outbound traffic has priority at a clear gate but cannot stop travellers midway",()=>{
  const departing={gate:"level4" as const,phase:"leaving" as const,
    x:gateTravelLane("level4","leaving"),z:5.6};
  const arriving={gate:"level4" as const,phase:"entering" as const,
    x:gateTravelLane("level4","entering"),z:13.1};
  assert.equal(gateFlowDirection("level4",[departing,arriving]),"leaving");
  assert(mustYieldAtGate(arriving,"leaving"));
  assert(!mustYieldAtGate({...arriving,z:GATE_OUTER_HOLD_Z-0.05},"leaving"),
    "an already admitted inbound actor must finish crossing");
  assert(mustYieldAtGate({...departing,z:GATE_INNER_HOLD_Z},"entering"));
  assert(!mustYieldAtGate({...departing,z:GATE_INNER_HOLD_Z+0.02},"entering"),
    "a departing actor past the inner hold line cannot freeze in the doorway");
});

test("Level 4 and Level 6 traffic reservations do not block each other",()=>{
  const level4Leaving={gate:"level4" as const,phase:"leaving" as const,x:-3.43,z:8};
  const level6Entering={gate:"level6" as const,phase:"entering" as const,x:3.43,z:8};
  assert.equal(gateFlowDirection("level4",[level4Leaving,level6Entering]),"leaving");
  assert.equal(gateFlowDirection("level6",[level4Leaving,level6Entering]),"entering");
  assert(!mustYieldAtGate(level6Entering,"entering"));
});

test("neighbour collisions are soft after a short wait, preserving furniture",()=>{
  const origin={x:0,z:0},goal={x:2,z:0};
  const people=[{x:0.45,z:0}];
  const early=shopCrowdStep(origin,goal,people,0.2,()=>true,0,false);
  assert.equal(early.softPass,false);
  assert.equal(early.point,null,"two people cannot walk through each other immediately");
  const released=shopCrowdStep(origin,goal,people,0.2,()=>true,
    NPC_SOFT_PASS_AFTER_SECONDS,false);
  assert.equal(released.softPass,true);
  assert.deepEqual(released.point,{x:0.2,z:0},
    "a stuck customer continues along the original planned segment");
  const solidShelf=shopCrowdStep(origin,goal,people,0.2,
    next=>next.x<=0,NPC_SOFT_PASS_AFTER_SECONDS,false);
  assert.equal(solidShelf.point,null,"only customers become permeable, never shelving");
  assert.equal(solidShelf.softPass,false);
});

test("soft passing stays deterministic, does not skip navigation or force blocked geometry",()=>{
  const from={x:0.6,z:0.25},goal={x:2,z:0.25};
  const other=[{x:0.8,z:0.25}];
  const step=shopCrowdStep(from,goal,other,0.05,point=>point.z>=0.2,
    NPC_SOFT_PASS_AFTER_SECONDS,false);
  assert(step.point);
  assert.equal(step.point!.z,0.25);
  assert(step.point!.x>from.x&&step.point!.x<=from.x+0.05+1e-9);
  assert.equal(step.softPass,true);
  assert.equal(shopCrowdStep(from,goal,other,0.05,()=>false,999,false).point,null);
});

test("a claimed final waypoint releases after one second, not while still out of reach",()=>{
  assert.equal(canFinishShopWaypoint(0.1,false,0),true);
  assert.equal(canFinishShopWaypoint(0.1,true,0),false);
  assert.equal(canFinishShopWaypoint(0.1,true,NPC_SOFT_PASS_AFTER_SECONDS),true);
  assert.equal(canFinishShopWaypoint(NPC_FINAL_WAYPOINT_RADIUS+0.01,false,100),false);
  assert.equal(canFinishShopWaypoint(NaN,false,100),false);
});

test("gate chokepoints release blocked NPC bodies sooner but never tunnel through furniture",()=>{
  const origin={x:-4.57,z:6.05};
  const goal={x:-4.57,z:4.65};
  const head={x:-4.57,z:5.75};
  const blocked=shopCrowdStep(origin,goal,[head],0.15,()=>true,
    NPC_GATE_SOFT_PASS_AFTER_SECONDS-0.01,false,NPC_GATE_SOFT_PASS_AFTER_SECONDS);
  assert.equal(blocked.softPass,false);
  assert.equal(blocked.point,null);
  const released=shopCrowdStep(origin,goal,[head],0.15,()=>true,
    NPC_GATE_SOFT_PASS_AFTER_SECONDS,false,NPC_GATE_SOFT_PASS_AFTER_SECONDS);
  assert.equal(released.softPass,true);
  assert(released.point&&released.point.z<origin.z);
  // The same jam on the open shop floor retains the longer 1.15s window.
  const aisle=shopCrowdStep(origin,goal,[head],0.15,()=>true,
    NPC_GATE_SOFT_PASS_AFTER_SECONDS,false);
  assert.equal(aisle.softPass,false);
  assert.equal(aisle.point,null);
  // Static colliders are never downgraded to visual NPC bodies.
  const solid=shopCrowdStep(origin,goal,[head],0.15,()=>false,100,
    false,NPC_GATE_SOFT_PASS_AFTER_SECONDS);
  assert.equal(solid.point,null);
  assert.equal(solid.softPass,false);
});

test("checkout-bound shoppers at the Level 4 mouth receive gate soft-pass too",()=>{
  assert.equal(inGateTrafficThroat({x:-4.4,z:6}),true,"incoming");
  assert.equal(inGateTrafficThroat({x:-3.5,z:5.5}),true,
    "customer crossing from gate to register is no longer entering");
  assert.equal(inGateTrafficThroat({x:4.5,z:5.3}),true,"same for Level 6");
  assert.equal(inGateTrafficThroat({x:0,z:5.5}),false,
    "the central register area retains ordinary collision timing");
  assert.equal(inGateTrafficThroat({x:-4.5,z:1}),false,
    "browsing beside a shelf must not trigger accelerated body passing");
});

test("perimeter idle positions avoid blocking shopping, checkout and request pockets",()=>{
  const layout=createShopLayout();
  const spots=idleShopPositions(layout,12);
  assert.equal(spots.length,12);
  assert(spots.every(p=>p.z<0),"normal waiting visitors should clear the front counter");
  const perimeter={x:-5.2,z:-5.5},checkout={x:0,z:0};
  assert(idleShopSpotPriority(perimeter,layout)<idleShopSpotPriority(checkout,layout));
  assert.equal(idleShopPositions(layout,6).length,6);
});

test("stationary shoppers yield only to approaching paths that actually cross them",()=>{
  const idle={x:-2,z:-2};
  assert.equal(idleShopperBlocksRoute(idle,{x:-2,z:-.3},{x:-2,z:-4}),true);
  assert.equal(idleShopperBlocksRoute(idle,{x:-2,z:-4},{x:-2,z:-5}),false);
  assert.equal(idleShopperBlocksRoute(idle,{x:2,z:-.3},{x:2,z:-4}),false);
  assert.equal(idleShopperBlocksRoute(idle,{x:-2,z:-.3},{x:-2,z:-.3}),false);
  assert.equal(idleShopperBlocksRoute(idle,{x:NaN,z:0},{x:-2,z:-4}),false);
});

test("saturated entrance spawns safely beyond all reserved positions",()=>{
  const lane=gateTravelLane("level4","entering");
  const occupied=Array.from({length:120},(_,i)=>
    ({x:lane,z:13+i*ENTRANCE_SPAWN_HEADWAY}));
  const z=nextEntranceSpawnZ(lane,occupied);
  assert(z>occupied.at(-1)!.z);
  assert(occupied.every(p=>Math.hypot(p.x-lane,p.z-z)>=NPC_CENTER_CLEARANCE));
});
 

test("safe sidesteps count as forward progress, not as a traffic deadlock",()=>{
  const from={x:0,z:0},goal={x:4,z:0};
  let seconds=0;
  // A 30- or 60-degree detour is forward progress even though the
  // immediate movement vector is not pointing directly at the goal.
  for(let tick=0;tick<24;tick++){
    const position={x:tick*0.1,z:0};
    const next={x:position.x+0.08,z:0.08};
    seconds=crowdStallSeconds(seconds,0.1,position,next,goal);
    assert.equal(seconds,0,"passing another shopper should not trigger ghosting");
  }
  // Purely lateral/backward oscillation remains stalled.
  assert.equal(crowdStallSeconds(0.6,0.2,from,{x:0,z:0.1},goal),0.8);
  assert.equal(crowdStallSeconds(0.8,0.2,from,{x:-0.1,z:0},goal),1);
  assert.equal(crowdStallSeconds(0.8,0.2,from,from,goal),1);
  assert.equal(crowdStallSeconds(0.2,0.1,from,from,goal,true),
    NPC_SOFT_PASS_AFTER_SECONDS);
});

test("only stationary shelf and idle waiters yield, never cashier or restock customers",()=>{
  assert(canYieldShopperSpot("queueing","waiting-for-next-day",false));
  assert(canYieldShopperSpot("queueing","waiting-for-shelf",false));
  assert(!canYieldShopperSpot("queueing","waiting-for-shelf",true),
    "shelf waiter following its retreat route must finish first");
  for(const state of ["awaiting-checkout","waiting-for-restock",
    "waiting-for-credit","walking-to-checkout","clearing-shelf-aisle"]){
    assert.equal(canYieldShopperSpot("queueing",state,false),false,state);
  }
  assert(!canYieldShopperSpot("browsing","waiting-for-shelf",false));
  assert(!canYieldShopperSpot("leaving","waiting-for-next-day",false));
});
