import type { Level5Room } from "./level5Room.ts";
import { checkoutQueuePoints } from "./checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, type ShopPoint, type ShopperRoute } from "./shopperNavigation.ts";
import type { ShopLayout } from "./shopLayout.ts";

const clearance=NPC_CENTER_CLEARANCE+0.17;
const distance=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** A temporary shopper waiting for an occupied shelf should remain near THAT
 * shelf, not trek to the rear-wall stockout/begging zone and back again.
 *
 * Candidate placements adapt to moved shelves, reserve destination space,
 * and cannot block the first checkout queues or either gate.
 */
export function reserveShelfWaitingRoute(
  layout:ShopLayout,
  from:ShopPoint,
  shelfAccess:ShopPoint,
  occupied:readonly ShopPoint[],
  destinations:readonly ShopPoint[],
  room?:Level5Room,
):{point:ShopPoint;route:ShopperRoute}|null {
  if(!Number.isFinite(shelfAccess.x)||!Number.isFinite(shelfAccess.z))
    return null;
  const checkout=checkoutQueuePoints(layout,{x:0,z:-1},8,room);
  const intoRoom=shelfAccess.x<0?1:-1;
  const candidates:ShopPoint[]=[];
  // Prioritize lateral pockets in the same browsing zone, then nearby
  // staggered points. Both wall orientations are permitted by validation.
  for(const offset of [1.55,2.15,2.85]){
    for(const dz of [0,-1.35,1.35,-2.4,2.4]){
      for(const direction of [intoRoom,-intoRoom]){
        const point={
          x:Math.round((shelfAccess.x+offset*direction)*4)/4,
          z:Math.round((shelfAccess.z+dz)*4)/4,
        };
        if(distance(point,shelfAccess)<1.25)continue;
        candidates.push(point);
      }
    }
  }
  // Both path length and distance to the shelf matter. Waiting a meter from
  // your shelf is useful; walking four unnecessary meters is not.
  let chosen:{point:ShopPoint;route:ShopperRoute;score:number}|null=null;
  for(const point of candidates){
    if(isObstructed(point,layout,room)||
       checkout.some(q=>distance(q,point)<clearance)||
       [...occupied,...destinations].some(q=>distance(q,point)<clearance))continue;
    const route=pathToShopGoal(from,point,layout,room);
    if(!route)continue;
    const last=route.waypoints.at(-1)??from;
    if(distance(last,point)>0.17)continue;
    const score=route.length*0.5+distance(point,shelfAccess)*0.85+
      distance(from,point)*0.25;
    if(!chosen||score<chosen.score)chosen={point,route,score};
  }
  return chosen?{point:chosen.point,route:chosen.route}:null;
}
