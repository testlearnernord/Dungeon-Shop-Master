import type { Level5Room } from "./level5Room.ts";
import {getCounterPlacement,rotateShelfOffset,type ShopLayout} from "./shopLayout.ts";
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

/** An arriving group needs more room than the bare collision radius; exact
 * 1.1m spawning behind a 1.02m body leaves virtually no headway at corners. */
export const ENTRANCE_SPAWN_HEADWAY=1.5;
/** Stagger new entrants along their lane so a burst never spawns overlapping bodies. */
export function nextEntranceSpawnZ(laneX:number,occupied:readonly ShopPoint[]):number {
  for(let i=0;i<120;i++){
    const z=13+i*ENTRANCE_SPAWN_HEADWAY;
    if(occupied.every(p=>Math.hypot(p.x-laneX,p.z-z)>=NPC_CENTER_CLEARANCE))return z;
  }
  return 13+120*ENTRANCE_SPAWN_HEADWAY;
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

/** Prefer perimeter idle stands, reserving customer service lanes for
 * actual shoppers; keep the central floor as finite overflow capacity. */
export function idleShopSpotPriority(p:ShopPoint,layout:ShopLayout):number {
  const counter=getCounterPlacement(layout);
  const registerDistance=Math.hypot(p.x-counter.x,p.z-counter.z);
  const shelfDistance=Math.min(...layout.shelves.map(shelf=>{
    const front=rotateShelfOffset(1.75,0,shelf.rotation);
    return Math.hypot(p.x-shelf.x-front.x,p.z-shelf.z-front.z);
  }));
  const restockDistance=Math.min(...[-3.65,-2.3,2.3,3.65].flatMap(x=>
    [-4.6,-3.2].map(z=>Math.hypot(p.x-x,p.z-z))));
  return Math.max(0,3.25-registerDistance)*4+
    Math.max(0,2.35-shelfDistance)*3+
    Math.max(0,1.3-restockDistance)*6+
    (p.z>-2.1?6:0)+(p.z>0?6:0)+
    (Math.abs(p.x)<1.6?2:0)-Math.min(5,Math.abs(p.x))*.25;
}

/** Only idle, non-service customers step aside when a moving shopper has
 * an immediate route through their standing place. Never make moving
 * shoppers jump or teleport through furniture. */
export function idleShopperBlocksRoute(
  idle:ShopPoint,walker:ShopPoint,waypoint:ShopPoint,
):boolean {
  if(![idle.x,idle.z,walker.x,walker.z,waypoint.x,waypoint.z]
    .every(Number.isFinite))return false;
  const length=Math.hypot(waypoint.x-walker.x,waypoint.z-walker.z);
  const separation=Math.hypot(idle.x-walker.x,idle.z-walker.z);
  if(length<=.35||separation<.1||separation>2.65)return false;
  const forward=((idle.x-walker.x)*(waypoint.x-walker.x)+
    (idle.z-walker.z)*(waypoint.z-walker.z))/length;
  return forward>.1&&forward<=length+.15&&
    segmentDistance(idle,walker,waypoint)<NPC_CENTER_CLEARANCE+.2;
}

/** Choose real, reachable, non-overlapping waiting destinations.
 * A moved shelf can invalidate a target, so allocate from the current layout
 * rather than snapping a blocked, hard-coded point onto another visitor.
 * The returned null means idle capacity is exhausted, not an occupied slot.
 */
const idleCache=new WeakMap<import("./shopLayout.ts").ShopLayout,{
  signature:string;positions:ShopPoint[];requestedCount:number;
}>();
export function idleShopPositions(
  layout:import("./shopLayout.ts").ShopLayout,count:number,room?:Level5Room,
):ShopPoint[] {
  if(!Number.isSafeInteger(count)||count<0||count>1000)
    throw new RangeError("Invalid visitor count");
  // Excavation changes the available floor without changing the furniture
  // object. Cache the geometry signature as well as the layout identity.
  const signature=JSON.stringify(room??null);
  const cached=idleCache.get(layout);
  if(cached?.signature===signature && cached.requestedCount>=count)
    return cached.positions.slice(0,count);
  const {isObstructed,pathToShopGoal}=navigation;
  const positions:ShopPoint[]=[];
  const origin={x:gateTravelLane("level4","entering"),z:6};
  const extent=room?6.25+room.expansionTier*2:6.25;
  const columns=Math.floor(extent*2/1.05)+1;
  const candidates:ShopPoint[]=[];
  for(let row=0;row<11;row++)for(let column=0;column<columns;column++)
    candidates.push({x:-extent+column*1.05,z:2.9-row*1.05});
  candidates.sort((a,b)=>idleShopSpotPriority(a,layout)-
    idleShopSpotPriority(b,layout)||a.z-b.z||a.x-b.x);
  for(const candidate of candidates){
    if(positions.length>=count)break;
    if(isObstructed(candidate,layout,room))continue;
    if(positions.some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<
      NPC_CENTER_CLEARANCE))continue;
    const route=pathToShopGoal(origin,candidate,layout,room);
    if(!route)continue;
    const actual=route.waypoints.at(-1)??candidate;
    if(isObstructed(actual,layout,room))continue;
    if(positions.some(p=>Math.hypot(p.x-actual.x,p.z-actual.z)<
      NPC_CENTER_CLEARANCE))continue;
    positions.push(actual);
  }
  idleCache.set(layout,{signature,positions,requestedCount:count});

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

/** The narrow physical gate can fit two visual lanes, but browser steering
 * must not let opposing crowds claim the doorway at the same time. All
 * coordinates are the 3D shop's X/Z metres, not simulated dungeon state. */
export type GateFlow = "entering" | "leaving";
export interface GateTrafficActor {
  readonly gate: GateSide;
  readonly phase: GateFlow;
  readonly x: number;
  readonly z: number;
}
export const GATE_INNER_HOLD_Z = 6.16;
export const GATE_OUTER_HOLD_Z = 12.84;
export const GATE_CLEAR_INSIDE_Z = 4.45;

/** Existing travellers always finish crossing before new counterflow enters.
 * When a gate is clear, a departing visitor near its threshold gets priority
 * over a visitor still waiting outside. The finite departure/arrival streams
 * prevent one direction from occupying the gate indefinitely. */
export function gateFlowDirection(
  gate: GateSide, actors: readonly GateTrafficActor[],
): GateFlow {
  const center = gate === "level4" ? -4 : 4;
  const local = actors.filter(actor=>actor.gate===gate &&
    Math.abs(actor.x-center)<1.7);
  const insideEntering = local.some(actor=>actor.phase==="entering" &&
    actor.z>GATE_CLEAR_INSIDE_Z && actor.z<GATE_OUTER_HOLD_Z);
  const insideLeaving = local.some(actor=>actor.phase==="leaving" &&
    actor.z>GATE_INNER_HOLD_Z && actor.z<13.2);
  if(insideEntering&&!insideLeaving)return "entering";
  if(insideLeaving)return "leaving";
  // Both active from an old save: do not admit *more* incoming traffic.
  if(insideEntering)return "entering";
  if(local.some(actor=>actor.phase==="leaving"&&
    actor.z>=GATE_CLEAR_INSIDE_Z && actor.z<=GATE_INNER_HOLD_Z))
    return "leaving";
  return "entering";
}

/** Only the *next* person waiting outside/inside yields. Never freeze someone
 * already inside the throat; doing so would turn a near miss into a deadlock. */
export function mustYieldAtGate(
  actor: GateTrafficActor, flow: GateFlow,
): boolean {
  if(actor.phase===flow)return false;
  if(actor.phase==="entering")
    return actor.z>=GATE_OUTER_HOLD_Z;
  const center=actor.gate==="level4"?-4:4;
  return actor.z<=GATE_INNER_HOLD_Z &&
    actor.z>=GATE_CLEAR_INSIDE_Z &&
    Math.abs(actor.x-center)<1.7;
}

/** NPC bodies are *presentation-only*. They must never deadlock the shop.
 * A prolonged neighbour collision temporarily relaxes only NPC clearance;
 * furniture, shop walls and gate priority are always enforced separately.
 */
export const NPC_SOFT_PASS_AFTER_SECONDS = 1.15;
/** Chokepoints disable sidesteps, so a shorter body-only grace avoids queues
 * while furniture, wall and directional right-of-way remain authoritative. */
export const NPC_GATE_SOFT_PASS_AFTER_SECONDS=0.45;

/** Includes shoppers already walking from the door toward the checkout.
 * They are not in the "entering" phase anymore, but can still block an
 * incoming customer at the shared throat on the shop side. */
export function inGateTrafficThroat(point:ShopPoint):boolean {
  return point.z>=4.8&&point.z<=13.2&&
    (Math.abs(point.x+4)<1.45||Math.abs(point.x-4)<1.45);
}
export const NPC_FINAL_WAYPOINT_RADIUS = 0.16;

export interface ShopCrowdMove {
  readonly point: ShopPoint | null;
  readonly softPass: boolean;
}

/** Prefer natural avoidance while it works. After sustained obstruction use
 * the same static-world collision test without other NPCs. That preserves
 * walls/shelves/counter and lets both pedestrians finish their routes.
 * A running soft pass stays active until its current waypoint is reached,
 * instead of alternating one movement frame and another full-second stop.
 */
export function shopCrowdStep(
  from: ShopPoint, goal: ShopPoint, occupied: readonly ShopPoint[],
  maxDistance: number, canWalk:(next: ShopPoint)=>boolean,
  blockedSeconds: number, allowSidestep=true,
  softAfterSeconds=NPC_SOFT_PASS_AFTER_SECONDS,
): ShopCrowdMove {
  if (blockedSeconds>=softAfterSeconds) {
    const unobstructed=crowdSafeStep(from,goal,[],maxDistance,canWalk,false);
    if(unobstructed)return {point:unobstructed,softPass:true};
  }
  return {
    point:crowdSafeStep(from,goal,occupied,maxDistance,canWalk,allowSidestep),
    softPass:false,
  };
}

/** Final approach does not require millimetre-perfect footsteps. If a
 * neighbour already owns the waypoint, wait briefly then allow arrival; the
 * shelf and checkout resource locks still govern interactions themselves.
 */
export function canFinishShopWaypoint(
  distance:number,neighborOccupied:boolean,blockedSeconds:number,
):boolean {
  return Number.isFinite(distance)&&distance<=NPC_FINAL_WAYPOINT_RADIUS&&
    (!neighborOccupied||blockedSeconds>=NPC_SOFT_PASS_AFTER_SECONDS);
}
