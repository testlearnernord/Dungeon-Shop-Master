import { COMPACT_COUNTER, getCounterPlacement, shelfBounds, type ShopLayout } from "./shopLayout.ts";
import { isLevel5Air, type Level5Room } from "./level5Room.ts";

export interface FloorPoint { readonly x:number; readonly z:number }

/** Single collision query for mined room topology and movable furniture.
 * Geometry, blueprint validation and NPC navigation can use the same result.
 * The room uses integer-centred 1m cells; every sampled cell touched by the
 * actor radius must be air, preventing corner clipping through solid rock.
 */
export function level5FloorWalkable(
  point:FloorPoint, room:Level5Room, layout:ShopLayout, radius=0.36,
):boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||
    !Number.isFinite(radius)||radius<0||radius>1)return false;
  const xs=[point.x-radius,point.x+radius];
  const zs=[point.z-radius,point.z+radius];
  for(const x of xs)for(const z of zs){
    if(!isLevel5Air(room,{x:Math.floor(x+0.5),z:Math.floor(z+0.5)}))
      return false;
  }
  const counter=getCounterPlacement(layout);
  const width=counter.rotation%2===0?COMPACT_COUNTER.topWidth:COMPACT_COUNTER.topDepth;
  const depth=counter.rotation%2===0?COMPACT_COUNTER.topDepth:COMPACT_COUNTER.topWidth;
  if(Math.abs(point.x-counter.x)<width/2+radius&&
    Math.abs(point.z-counter.z)<depth/2+radius)return false;
  for(const shelf of layout.shelves){
    const b=shelfBounds(shelf);
    if(point.x+radius>b.minX&&point.x-radius<b.maxX&&
      point.z+radius>b.minZ&&point.z-radius<b.maxZ)return false;
  }
  return true;
}

/** Use this for both placement previews and route segments. */
export function level5FloorSegmentWalkable(
  from:FloorPoint,to:FloorPoint,room:Level5Room,layout:ShopLayout,radius=0.36,
):boolean {
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  if(!Number.isFinite(length))return false;
  const samples=Math.max(1,Math.ceil(length/0.1));
  for(let i=0;i<=samples;i++){
    const t=i/samples;
    if(!level5FloorWalkable({x:from.x+(to.x-from.x)*t,
      z:from.z+(to.z-from.z)*t},room,layout,radius))return false;
  }
  return true;
}
