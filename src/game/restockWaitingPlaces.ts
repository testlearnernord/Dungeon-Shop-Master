import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE } from "./npcTraffic.ts";
import { shelfBounds, type ShopLayout } from "./shopLayout.ts";
import { isObstructed, pathToShopGoal, type ShopPoint, type ShopperRoute } from "./shopperNavigation.ts";

/** Reserved rear-wall waiting pockets, away from shelf access, both entrances
 * and the register. Unlike generic idle positions these never start in the
 * busiest browsing aisle. Validate every candidate against moved furniture. */
const REAR_POCKETS:readonly ShopPoint[]=[
  {x:-3.65,z:-4.6},{x:-2.30,z:-4.6},{x:2.30,z:-4.6},{x:3.65,z:-4.6},
  {x:-3.65,z:-3.2},{x:-2.30,z:-3.2},{x:2.30,z:-3.2},{x:3.65,z:-3.2},
];
export const RESTOCK_WAIT_CLEARANCE=NPC_CENTER_CLEARANCE+0.16;
export const RESTOCK_WAIT_MAX_Z=-3.1;
const distance=(a:ShopPoint,b:ShopPoint)=>
  Math.hypot(a.x-b.x,a.z-b.z);
function shelfClearance(point:ShopPoint,layout:ShopLayout):number {
  return Math.min(...layout.shelves.map(shelf=>{
    const b=shelfBounds(shelf);
    const dx=Math.max(b.minX-point.x,0,point.x-b.maxX);
    const dz=Math.max(b.minZ-point.z,0,point.z-b.maxZ);
    return Math.hypot(dx,dz);
  }));
}
export function restockWaitingPositions(layout:ShopLayout,room?:Level5Room):readonly ShopPoint[] {
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},12,room);
  const positions:ShopPoint[]=[];
  for(const point of REAR_POCKETS){
    if(isObstructed(point,layout,room)||shelfClearance(point,layout)<1.05||
      checkout.some(other=>distance(point,other)<RESTOCK_WAIT_CLEARANCE))continue;
    const route=pathToShopGoal({x:-3.43,z:4.65},point,layout,room);
    const end=route?.waypoints.at(-1)??{x:-3.43,z:4.65};
    if(!route||distance(end,point)>0.17||
      positions.some(other=>distance(point,other)<RESTOCK_WAIT_CLEARANCE))continue;
    positions.push(point);
  }
  return positions;
}

/** Allocate by future destination AND current occupancy, then validate the
 * route from this shopper. A blocked candidate is skipped, not silently
 * replaced with the NPC's current position beside a shelf. */
export function reserveRestockWaitingRoute(
  layout:ShopLayout,from:ShopPoint,
  occupied:readonly ShopPoint[],destinations:readonly ShopPoint[],
  preferredIndex=0,room?:Level5Room,
):{point:ShopPoint;route:ShopperRoute}|null {
  const positions=restockWaitingPositions(layout,room);
  if(!positions.length)return null;
  const index=((preferredIndex%positions.length)+positions.length)%positions.length;
  for(const point of [...positions.slice(index),...positions.slice(0,index)]){
    if([...occupied,...destinations].some(other=>distance(point,other)<RESTOCK_WAIT_CLEARANCE))
      continue;
    const route=pathToShopGoal(from,point,layout,room);
    const last=route?.waypoints.at(-1)??from;
    if(route&&distance(last,point)<=0.17)return {point,route};
  }
  return null;
}
