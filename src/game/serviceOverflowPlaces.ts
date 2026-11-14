import type { Level5Room } from "./level5Room.ts";
import { idleShopPositions, NPC_CENTER_CLEARANCE } from "./npcTraffic.ts";
import { restockWaitingPositions } from "./restockWaitingPlaces.ts";
import { pathToShopGoal, type ShopPoint, type ShopperRoute } from "./shopperNavigation.ts";
import type { ShopLayout } from "./shopLayout.ts";

const clearance=NPC_CENTER_CLEARANCE+0.16;
const distance=(a:ShopPoint,b:ShopPoint)=>
  Math.hypot(a.x-b.x,a.z-b.z);

/** Give excess checkout customers and stockout visitors a separate safe
 * holding place. The service destinations themselves stay reserved for the
 * customers who have already claimed them. No false arrival at a snapped
 * location: every chosen spot has a real furniture-safe route from the NPC.
 *
 * This is only presentation/navigation, never an additional queue, sale or
 * timed game-state transition.
 */
export function reserveServiceOverflowRoute(
  layout:ShopLayout,from:ShopPoint,
  occupied:readonly ShopPoint[],destinations:readonly ShopPoint[],
  checkoutPoints:readonly ShopPoint[],preferredIndex=0,room?:Level5Room,
):{point:ShopPoint;route:ShopperRoute}|null {
  if(!Number.isSafeInteger(preferredIndex)||preferredIndex<0)
    throw new RangeError("Invalid shopper slot");
  const spots=idleShopPositions(layout,100,room);
  if(!spots.length)return null;
  const reserved=[...occupied,...destinations,...checkoutPoints,
    ...restockWaitingPositions(layout,room)];
  const start=preferredIndex%spots.length;
  for(const point of [...spots.slice(start),...spots.slice(0,start)]){
    // Do not create another waiting line across the Level 4/6 entrances.
    if(point.z>0.5||reserved.some(other=>distance(point,other)<clearance))
      continue;
    const route=pathToShopGoal(from,point,layout,room);
    const end=route?.waypoints.at(-1)??from;
    if(route&&distance(point,end)<=0.17)return {point,route};
  }
  return null;
}
