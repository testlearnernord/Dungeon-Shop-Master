/** Pure north-up dungeon map adapter. Grid north is always +Z and
 * occupies the TOP of screen; WASD is never reversed by mouse dragging.
 * All yaw rotation belongs to the opt-in 3D combat camera, not this map. */
export interface DungeonMapPose {
  readonly x:number;readonly z:number;
  readonly yaw:number;readonly pitch:number;readonly distance:number;
}
export interface DungeonMapPoint {readonly x:number;readonly y:number;readonly z:number}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
export const DUNGEON_NORTH_YAW=0;
export function mapPoseFromCamera(
  position:DungeonMapPoint,target:DungeonMapPoint,
):DungeonMapPose{
  const x=target.x,z=target.z;
  const dx=position.x-x,dz=position.z-z,dy=position.y-target.y;
  const distance=Math.max(1,Math.hypot(dx,dy,dz));
  return {x,z,yaw:Math.atan2(dx,-dz),pitch:Math.asin(clamp(dy/distance,-1,1)),
    distance};
}
export function mapCameraPosition(p:DungeonMapPose):DungeonMapPoint{
  const horizontal=Math.cos(p.pitch)*p.distance;
  return {x:p.x+Math.sin(p.yaw)*horizontal,
    y:Math.sin(p.pitch)*p.distance,
    z:p.z-Math.cos(p.yaw)*horizontal};
}
export function orbitDungeonMap(p:DungeonMapPose,_dx:number,dy:number):DungeonMapPose{
  // Dragging can still tilt the perspective; horizontal drag is consumed
  // by the viewer as camera slide. It must never rotate north away from up.
  return {...p,yaw:DUNGEON_NORTH_YAW,
    pitch:clamp(p.pitch+dy*.005,.32,1.48)};
}
export function zoomDungeonMap(p:DungeonMapPose,wheelY:number):DungeonMapPose{
  return {...p,distance:clamp(p.distance*Math.exp(clamp(wheelY,-600,600)*.001),16,115)};
}
export function panDungeonMap(
  p:DungeonMapPose,right:number,forward:number,amount:number,
  bounds:{halfX:number;halfZ:number},
):DungeonMapPose{
  const dx=right*amount,dz=forward*amount;
  // Even if an old camera pose contains rotated yaw, the player controls
  // are cardinal: W +Z (north), S -Z, A -X, D +X.
  return { ...p,yaw:DUNGEON_NORTH_YAW,
    x:clamp(p.x+dx,-bounds.halfX,bounds.halfX),
    z:clamp(p.z+dz,-bounds.halfZ,bounds.halfZ)};
}
export function mapCameraTarget(p:DungeonMapPose):DungeonMapPoint{
  return {x:p.x,y:0,z:p.z};
}
