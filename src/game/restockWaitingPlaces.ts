import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import { idleShopPositions, NPC_STATION_CLEARANCE } from "./npcTraffic.ts";
import { shelfBounds, type ShopLayout } from "./shopLayout.ts";
import { createShopRoutePlanner, isObstructed, type ShopPoint } from "./shopperNavigation.ts";

export const RESTOCK_WAIT_CLEARANCE=NPC_STATION_CLEARANCE;
const distance=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

function shelfClearance(point:ShopPoint,layout:ShopLayout):number {
  return Math.min(...layout.shelves.map(shelf=>{
    const b=shelfBounds(shelf);
    const dx=Math.max(b.minX-point.x,0,point.x-b.maxX);
    const dz=Math.max(b.minZ-point.z,0,point.z-b.maxZ);
    return Math.hypot(dx,dz);
  }));
}

/** A request is a conversation, not permission to park in a doorway.
 * This only filters busy circulation bands, never hard-codes wait positions;
 * the room-aware candidate generator still supplies locations in mined wings.
 */
export function isQuietPetitionArea(point:ShopPoint):boolean{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return false;
  // Shop-side entrance approaches and the shared inner circulation lane
  // must remain clear even when all cashier spots happen to be elsewhere.
  if(point.z>1.25||point.z< -5.85)return false;
  if(point.z> -4.8&&Math.abs(point.x)<1.65)return false;
  return true;
}

/** Generate request/credit stations from the current excavated room and moved
 * furniture. These are presentation destinations, not baked coordinates from
 * the original cave. Both entrances must be able to reach every returned spot.
 */
export function restockWaitingPositions(
  layout:ShopLayout,room?:Level5Room,
):readonly ShopPoint[] {
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},12,room);
  const entrances:readonly ShopPoint[]=[
    {x:-3.43,z:4.65},{x:4.57,z:4.65},
  ];
  const positions:ShopPoint[]=[];
  // A single topology-scoped grid serves both gates and all candidates.
  // Constructing a new planner twice per candidate needlessly multiplied
  // the expensive grid work when validating moved furniture.
  const routeTo=createShopRoutePlanner(layout,room);
  for(const point of idleShopPositions(layout,64,room)){
    if(positions.length>=12)break;
    if(!isQuietPetitionArea(point)||isObstructed(point,layout,room)||
       shelfClearance(point,layout)<1.35||
       checkout.some(other=>distance(point,other)<1.8)||
       positions.some(other=>distance(point,other)<1.65))
      continue;
    const reachable=entrances.every(origin=>{
      const route=routeTo(origin,point);
      const end=route?.waypoints.at(-1)??origin;
      return !!route&&distance(end,point)<=0.17;
    });
    if(reachable)positions.push(point);
  }
  return positions;
}
