import type { GateSide } from "./npcVisitors.ts";
import * as navigation from "./shopperNavigation.ts";
import type { ShopPoint } from "./shopperNavigation.ts";

/** Minimum center-to-center clearance for rendered NPC shoulders, not a radius. */
export const NPC_CENTER_CLEARANCE=1.02;

/** Closest a neighbour gets to an entire step, not just the step's endpoint. */
function segmentDistance(p:ShopPoint,a:ShopPoint,b:ShopPoint):number {
  const vx=b.x-a.x,vz=b.z-a.z,mag2=vx*vx+vz*vz;
  const t=mag2===0?0:Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.z-a.z)*vz)/mag2));
  return Math.hypot(p.x-a.x-vx*t,p.z-a.z-vz*t);
}

/** Deterministic local steering: keep right relative to heading first, yield
 * when blocked in narrow gates. Static collision is supplied by the caller.
 * If two models already overlap, permit only movement away from each other. */
export function crowdSafeStep(
  from:ShopPoint,goal:ShopPoint,occupied:readonly ShopPoint[],
  maxDistance:number,canWalk:(next:ShopPoint)=>boolean,allowSidestep=true,
):ShopPoint|null {
  const dx=goal.x-from.x,dz=goal.z-from.z,length=Math.hypot(dx,dz);
  if(!Number.isFinite(length)||length<=0||
     !Number.isFinite(maxDistance)||maxDistance<=0)return null;
  const step=Math.min(length,maxDistance),nx=dx/length,nz=dz/length;
  // When the first row of the aisle jams, backing away may be the
  // only collision-safe move. The segment test still prevents tunnelling.
  const angles=allowSidestep
    ? [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,
       Math.PI/2,-Math.PI/2,2*Math.PI/3,-2*Math.PI/3,
       5*Math.PI/6,-5*Math.PI/6,Math.PI]
    : [0];
  for(const angle of angles){
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const candidate={x:from.x+(nx*cos-nz*sin)*step,
      z:from.z+(nx*sin+nz*cos)*step};
    if(!canWalk(candidate))continue;
    if(occupied.some(other=>{
      const before=Math.hypot(other.x-from.x,other.z-from.z);
      const after=Math.hypot(other.x-candidate.x,other.z-candidate.z);
      const nearest=segmentDistance(other,from,candidate);
      return before<NPC_CENTER_CLEARANCE-1e-6
        ? after<=before+1e-6||nearest<before-1e-6
        : nearest<NPC_CENTER_CLEARANCE-1e-6;
    }))continue;
    return candidate;
  }
  return null;
}

/** Separate inbound and outbound traffic within the 2.4m corridor. */
export function gateTravelLane(gate:GateSide,phase:"entering"|"leaving"):number {
  const center=gate==="level4"?-4:4;
  const side=gate==="level4"?-1:1;
  return center+side*(phase==="entering"?0.57:-0.57);
}

/** Stagger new entrants along their lane so a burst never spawns overlapping bodies. */
export function nextEntranceSpawnZ(laneX:number,occupied:readonly ShopPoint[]):number {
  for(let i=0;i<120;i++){
    const z=13+i*1.1;
    if(occupied.every(p=>Math.hypot(p.x-laneX,p.z-z)>=NPC_CENTER_CLEARANCE))return z;
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
const idleCache=new WeakMap<import("./shopLayout.ts").ShopLayout,ShopPoint[]>();
export function idleShopPositions(
  layout:import("./shopLayout.ts").ShopLayout,count:number,
):ShopPoint[] {
  if(!Number.isSafeInteger(count)||count<0||count>1000)
    throw new RangeError("Invalid visitor count");
  const cached=idleCache.get(layout);
  if(cached && (cached.length>=count || cached.length===100))return cached.slice(0,count);
  const {isObstructed,pathToShopGoal}=navigation;
  const positions:ShopPoint[]=[];
  const origin={x:gateTravelLane("level4","entering"),z:6};
  for(let row=0;row<11&&positions.length<count;row++){
    const z=2.9-row*1.05;
    for(let column=0;column<13&&positions.length<count;column++){
      const x=-6.25+column*1.05;
      const candidate={x,z};
      if(isObstructed(candidate,layout))continue;
      if(positions.some(p=>Math.hypot(p.x-x,p.z-z)<NPC_CENTER_CLEARANCE))continue;
      const route=pathToShopGoal(origin,candidate,layout);
      if(!route)continue;
      const actual=route.waypoints.at(-1)??candidate;
      if(isObstructed(actual,layout))continue;
      if(positions.some(p=>Math.hypot(p.x-actual.x,p.z-actual.z)<NPC_CENTER_CLEARANCE))continue;
      positions.push(actual);
    }
  }
  if(count===100)idleCache.set(layout,positions);
  return positions;
}

/** Clear the inner doorway before the entrant is handed to its shopping route.
 * Otherwise the first entrant switches to browsing *inside the doorway* and
 * physically holds the entire line behind it.
 */
export const ENTRANCE_STAGING_Z=4.65;

/** A visitor switching from leaving back to shopping must not go to the gate
 * if they have not even left the shop yet. For visitors already past the
 * doorway, finish the outside lane change before re-entering.
 * This function is pure: no save, inventory or visitor-state side effects.
 */
export function entranceApproachRoute(
  gate:GateSide,position:ShopPoint,fromOutside:boolean,
  innerZ:number,outerZ:number,
):ShopPoint[] {
  if(!fromOutside && position.z<=innerZ+0.25)return [];
  const laneX=gateTravelLane(gate,"entering");
  const approach=fromOutside
    ?[{x:laneX,z:innerZ}]
    :interruptedDepartureRoute(gate,position,innerZ,outerZ);
  return [...approach,{x:laneX,z:ENTRANCE_STAGING_Z}];
}
