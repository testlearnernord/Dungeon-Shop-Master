import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import {restockWaitingPositions} from "./restockWaitingPlaces.ts";
import { createShopRoutePlanner, isObstructed, type ShopPoint } from "./shopperNavigation.ts";
import {shopLayoutProblem,type ShopLayout} from "./shopLayout.ts";
import {shelfServicePoint,SHELF_SLOT_COUNT} from "./furnitureRegistry.ts";
import {shopPortalServicePoint} from "./shopPortal.ts";

/** A furniture commit is invalid if the physical entrance, checkout and
 * shelf service sockets no longer share a walkable component.
 *
 * Unlike rectangular reserved aisles this validates actual paths across a
 * rearranged store. It must be consulted at the UI AND authoritative commit.
 * A returned error never changes any saved layout or shelf contents.
 */
export function shopServiceReachabilityProblem(layout:ShopLayout,room?:Level5Room):string|null {
  const geometryError=shopLayoutProblem(layout,room);
  if(geometryError)return geometryError;
  // Both visitor lanes are inside the ONE cursed portal. Check arrival and
  // physical departure without inventing a second door in the sealed wall.
  const route=createShopRoutePlanner(layout,room);
  const entrance:ShopPoint=shopPortalServicePoint("entering");
  const exit:ShopPoint=shopPortalServicePoint("leaving");
  const queue=checkoutQueuePoints(layout,{x:0,z:-1},8,room);
  if(queue.length<1)
    return "The checkout has no reachable customer standing position.";
  const cashier=queue[0];
  if(isObstructed(cashier,layout,room))
    return "The checkout is obstructed.";
  if(!route(entrance,cashier))
    return "The cursed portal cannot reach the checkout.";
  if(!route(cashier,exit))
    return "The checkout cannot reach the cursed portal exit.";
  // An editor may not commit furniture that leaves buyers able to reach
  // shelves and checkout but traps all stockout/credit petitioners. Two
  // independent request pockets must remain reachable through the portal.
  const requests=restockWaitingPositions(layout,room).filter(point=>
    route(entrance,point)!==null&&route(point,exit)!==null);
  const petitionPair=requests.some((a,index)=>requests.slice(index+1)
    .some(b=>Math.hypot(a.x-b.x,a.z-b.z)>=1.18));
  if(!petitionPair)
    return "Leave two accessible waiting areas for restock requests and credit.";
  for(const shelf of layout.shelves){
    for(let slot=0;slot<SHELF_SLOT_COUNT;slot++){
      const service=shelfServicePoint(shelf,slot);
      if(isObstructed(service,layout,room))
        return "Customer standing space is blocked at "+shelf.id+" slot "+(slot+1)+".";
      if(!route(entrance,service)||!route(service,cashier))
        return "A shelf service point cannot reach the entrance and checkout.";
    }
  }
  return null;
}
