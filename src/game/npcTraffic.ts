import type { GateSide } from "./npcVisitors.ts";
import * as navigation from "./shopperNavigation.ts";
import type { ShopPoint } from "./shopperNavigation.ts";

/** Separate inbound and outbound traffic within the 2.4m corridor. */
export function gateTravelLane(gate:GateSide,phase:"entering"|"leaving"):number {
  const center=gate==="level4"?-4:4;
  const side=gate==="level4"?-1:1;
  return center+side*(phase==="entering"?0.43:-0.43);
}

/** Stagger new entrants along their lane so a burst never spawns overlapping bodies. */
export function nextEntranceSpawnZ(laneX:number,occupied:readonly ShopPoint[]):number {
  for(let i=0;i<120;i++){
    const z=13+i*0.8;
    if(occupied.every(p=>Math.hypot(p.x-laneX,p.z-z)>=0.7))return z;
  }
  return 13+120*0.8;
}

/** Re-entering a shop during an outbound animation must not cross the
 * physical corridor wall or head-on traffic. Change lanes beyond the gate. */
export function interruptedDepartureRoute(
  gate:GateSide,position:ShopPoint,innerZ:number,outerZ:number,
):ShopPoint[] {
  const incomingX=gateTravelLane(gate,"entering");
  if(position.z>innerZ+0.25){
    const turnZ=Math.max(position.z,outerZ+1.0);
    return [
      {x:position.x,z:turnZ},
      {x:incomingX,z:turnZ},
      {x:incomingX,z:innerZ},
    ];
  }
  return [{x:incomingX,z:innerZ}];
}

/** Choose real, reachable, non-overlapping waiting destinations.
 * A moved shelf can invalidate a target, so allocate from the current layout
 * rather than snapping a blocked, hard-coded point onto another visitor.
 * The returned null means idle capacity is exhausted, not an occupied slot.
 */
export function idleShopPositions(
  layout:import("./shopLayout.ts").ShopLayout,count:number,
):ShopPoint[] {
  if(!Number.isSafeInteger(count)||count<0||count>1000)
    throw new RangeError("Invalid visitor count");
  const {isObstructed,pathToShopGoal}=navigation;
  const positions:ShopPoint[]=[];
  const origin={x:gateTravelLane("level4","entering"),z:6};
  for(let row=0;row<10&&positions.length<count;row++){
    const z=0.6-row*0.72;
    for(let column=0;column<18&&positions.length<count;column++){
      const x=-6.3+column*0.74;
      const candidate={x,z};
      if(isObstructed(candidate,layout))continue;
      if(positions.some(p=>Math.hypot(p.x-x,p.z-z)<0.7))continue;
      const route=pathToShopGoal(origin,candidate,layout);
      if(!route)continue;
      const actual=route.waypoints.at(-1)??candidate;
      if(isObstructed(actual,layout))continue;
      if(positions.some(p=>Math.hypot(p.x-actual.x,p.z-actual.z)<0.7))continue;
      positions.push(actual);
    }
  }
  return positions;
}
