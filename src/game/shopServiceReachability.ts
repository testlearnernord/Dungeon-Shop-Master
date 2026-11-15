import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import {restockWaitingPositions} from "./restockWaitingPlaces.ts";
import { isObstructed, pathToShopGoal, type ShopPoint } from "./shopperNavigation.ts";
import { rotateShelfOffset, shopLayoutProblem, type ShopLayout } from "./shopLayout.ts";

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
  const entrances:ShopPoint[]=[
    {x:-3.43,z:4.65},{x:4.57,z:4.65},
  ];
  const queue=checkoutQueuePoints(layout,{x:0,z:-1},8,room);
  if(queue.length<1)
    return "The checkout has no reachable customer standing position.";
  const cashier=queue[0];
  if(isObstructed(cashier,layout,room))
    return "The checkout is obstructed.";
  for(const [index,origin] of entrances.entries()){
    const route=pathToShopGoal(origin,cashier,layout,room);
    if(!route)
      return "Entrance "+(index+1)+" cannot reach the checkout.";
  }
  // An editor may not commit furniture that leaves buyers able to reach
  // shelves and checkout but traps all stockout/credit petitioners. Two
  // independent request pockets must remain reachable from both gates.
  const requests=restockWaitingPositions(layout,room).filter(point=>
    entrances.every(origin=>pathToShopGoal(origin,point,layout,room)!==null));
  const petitionPair=requests.some((a,index)=>requests.slice(index+1)
    .some(b=>Math.hypot(a.x-b.x,a.z-b.z)>=1.18));
  if(!petitionPair)
    return "Leave two accessible waiting areas for restock requests and credit.";
  for(const shelf of layout.shelves){
    for(let slot=0;slot<5;slot++){
      const offset=rotateShelfOffset(1.75,slot-2,shelf.rotation);
      const service={x:shelf.x+offset.x,z:shelf.z+offset.z};
      if(isObstructed(service,layout,room))
        return "Customer standing space is blocked at "+shelf.id+" slot "+(slot+1)+".";
      if(entrances.some(origin=>!pathToShopGoal(origin,service,layout,room))||
         !pathToShopGoal(service,cashier,layout,room))
        return "A shelf service point cannot reach the entrance and checkout.";
    }
  }
  return null;
}
