import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import { idleShopPositions, NPC_STATION_CLEARANCE } from "./npcTraffic.ts";
import { shelfBounds, type ShopLayout } from "./shopLayout.ts";
import { isObstructed, pathToShopGoal, type ShopPoint } from "./shopperNavigation.ts";

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
  for(const point of idleShopPositions(layout,64,room)){
    if(positions.length>=12)break;
    if(isObstructed(point,layout,room)||
       shelfClearance(point,layout)<1.35||
       checkout.some(other=>distance(point,other)<1.8)||
       positions.some(other=>distance(point,other)<1.65))
      continue;
    const reachable=entrances.every(origin=>{
      const route=pathToShopGoal(origin,point,layout,room);
      const end=route?.waypoints.at(-1)??origin;
      return !!route&&distance(end,point)<=0.17;
    });
    if(reachable)positions.push(point);
  }
  return positions;
}
