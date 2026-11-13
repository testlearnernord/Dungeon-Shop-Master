import { checkoutQueuePoints } from "./checkoutQueue.ts";
import { isObstructed, pathToShopGoal, type ShopPoint } from "./shopperNavigation.ts";
import { rotateShelfOffset, type ShopLayout } from "./shopLayout.ts";

/** A furniture commit is invalid if the physical entrance, checkout and
 * shelf service sockets no longer share a walkable component.
 *
 * Unlike rectangular reserved aisles this validates actual paths across a
 * rearranged store. It must be consulted at the UI AND authoritative commit.
 * A returned error never changes any saved layout or shelf contents.
 */
export function shopServiceReachabilityProblem(layout:ShopLayout):string|null {
  const entrances:ShopPoint[]=[
    {x:-3.43,z:4.65},{x:4.57,z:4.65},
  ];
  const queue=checkoutQueuePoints(layout,{x:0,z:-1},8);
  if(queue.length<1)
    return "The checkout has no reachable customer standing position.";
  const cashier=queue[0];
  if(isObstructed(cashier,layout))
    return "The checkout is obstructed.";
  for(const [index,origin] of entrances.entries()){
    const route=pathToShopGoal(origin,cashier,layout);
    if(!route)
      return "Entrance "+(index+1)+" cannot reach the checkout.";
  }
  for(const shelf of layout.shelves){
    for(let slot=0;slot<5;slot++){
      const offset=rotateShelfOffset(1.75,slot-2,shelf.rotation);
      const service={x:shelf.x+offset.x,z:shelf.z+offset.z};
      if(isObstructed(service,layout))
        return "Customer standing space is blocked at "+shelf.id+" slot "+(slot+1)+".";
      if(!entrances.some(origin=>pathToShopGoal(origin,service,layout))||
         !pathToShopGoal(service,cashier,layout))
        return "A shelf service point cannot reach the entrance and checkout.";
    }
  }
  return null;
}
