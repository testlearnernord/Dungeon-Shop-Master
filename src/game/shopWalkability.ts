import {shopFloorFixtures,type ShopLayout} from "./shopLayout.ts";
import {pointTouchesShopBounds} from "./furnitureRegistry.ts";
import { isShopRoomAir, type ShopRoomGeometry } from "./shopRoomGeometry.ts";

export interface FloorPoint { readonly x:number; readonly z:number }

/** Single collision query for mined room topology and movable furniture.
 * Geometry, blueprint validation and NPC navigation can use the same result.
 * The room uses integer-centred 1m cells; every sampled cell touched by the
 * actor radius must be air, preventing corner clipping through solid rock.
 */
export function shopFloorWalkable(
  point:FloorPoint, room:ShopRoomGeometry, layout:ShopLayout, radius=0.36,
):boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||
    !Number.isFinite(radius)||radius<0||radius>1)return false;
  const xs=[point.x-radius,point.x+radius];
  const zs=[point.z-radius,point.z+radius];
  for(const x of xs)for(const z of zs){
    if(!isShopRoomAir(room,{x:Math.floor(x+0.5),z:Math.floor(z+0.5)}))
      return false;
  }
  // The same registered solid hulls drive navigation and visible
  // furniture selection, regardless of which wall has been excavated.
  for(const fixture of shopFloorFixtures(layout))
    if(pointTouchesShopBounds(fixture.solid,point,radius))return false;
  return true;
}

/** Use this for both placement previews and route segments. */
export function shopFloorSegmentWalkable(
  from:FloorPoint,to:FloorPoint,room:ShopRoomGeometry,layout:ShopLayout,radius=0.36,
):boolean {
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  if(!Number.isFinite(length))return false;
  const samples=Math.max(1,Math.ceil(length/0.1));
  for(let i=0;i<=samples;i++){
    const t=i/samples;
    if(!shopFloorWalkable({x:from.x+(to.x-from.x)*t,
      z:from.z+(to.z-from.z)*t},room,layout,radius))return false;
  }
  return true;
}
