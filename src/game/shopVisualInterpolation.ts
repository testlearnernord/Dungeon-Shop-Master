/** Presentation only: one FIXED 50ms saved motion step can be shown at
 * arbitrary display FPS without using a second NPC physics/movement solver.
 * Never write an interpolated pose into the authoritative checkpoint.
 */
export interface SavedShopPose {
  readonly x:number;
  readonly z:number;
  readonly yaw:number;
}
export function interpolateSavedShopPose(
  from:SavedShopPose,to:SavedShopPose,alpha:number,
):SavedShopPose{
  if(!Number.isFinite(alpha))throw new RangeError("Invalid render interpolation factor.");
  const t=Math.min(1,Math.max(0,alpha));
  if(t===0)return {...from};
  if(t===1)return {...to};
  const delta=Math.atan2(Math.sin(to.yaw-from.yaw),
    Math.cos(to.yaw-from.yaw));
  return {x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,
    yaw:from.yaw+delta*t};
}
