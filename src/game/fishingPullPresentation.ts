/** Presentation-only mapping. The authoritative fishing target is always the
 * direction the player must FLICK, so the hooked fish pulls against it.
 * Screen +X points right and screen +Y points down, matching mouse deltas. */
export interface ScreenPull {readonly x:number;readonly y:number}
export interface WorldPull {readonly x:number;readonly z:number}
export function fishPullAgainst(target:ScreenPull):ScreenPull{
  const length=Math.hypot(target.x,target.y);
  if(!Number.isFinite(length)||length===0)return {x:0,y:0};
  return {x:-target.x/length,y:-target.y/length};
}

/** Project the opposite screen-space pull onto the water plane using the
 * camera's horizontal view basis. No decisions, chance or game state here. */
export function fishPullOnWater(
  cameraYaw:number,fishScreenPull:ScreenPull,
):WorldPull{
  if(!Number.isFinite(cameraYaw))return {x:0,z:0};
  const length=Math.hypot(fishScreenPull.x,fishScreenPull.y);
  if(!Number.isFinite(length)||length===0)return {x:0,z:0};
  const x=fishScreenPull.x/length,y=fishScreenPull.y/length;
  const rightX=Math.cos(cameraYaw),rightZ=-Math.sin(cameraYaw);
  const forwardX=Math.sin(cameraYaw),forwardZ=Math.cos(cameraYaw);
  // Down on the screen maps toward the camera on the horizontal water plane.
  return {x:rightX*x-forwardX*y,z:rightZ*x-forwardZ*y};
}

/** Preserve a legible fish silhouette inside the 2 x 3 metre pond. */
export function keepFishInsidePond(dx:number,dz:number):WorldPull{
  return {x:Math.max(-.66,Math.min(.66,dx)),
    z:Math.max(-1.06,Math.min(1.06,dz))};
}
