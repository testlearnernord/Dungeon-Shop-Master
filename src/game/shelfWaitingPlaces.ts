import type { ShopPoint } from "./shopperNavigation.ts";

const distance=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Recompute local shelf-wait candidates from the actual service socket after
 * every furniture/room update. Reservation, collision and routing belong to
 * ShopServiceSpots; this module only proposes nearby geometry.
 */
export function shelfWaitingCandidates(
  shelfAccess:ShopPoint,
):readonly ShopPoint[]{
  if(!Number.isFinite(shelfAccess.x)||!Number.isFinite(shelfAccess.z))return [];
  const intoRoom=shelfAccess.x<0?1:-1;
  const candidates:ShopPoint[]=[];
  for(const offset of [1.55,2.15,2.85]){
    for(const dz of [0,-1.35,1.35,-2.4,2.4]){
      for(const direction of [intoRoom,-intoRoom]){
        const point={
          x:Math.round((shelfAccess.x+offset*direction)*4)/4,
          z:Math.round((shelfAccess.z+dz)*4)/4,
        };
        if(distance(point,shelfAccess)>=1.25)candidates.push(point);
      }
    }
  }
  return candidates;
}
