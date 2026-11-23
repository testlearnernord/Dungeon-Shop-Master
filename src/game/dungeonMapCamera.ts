/** Pure map-camera orbit/pan adapter. North is world +Z. Camera yaw
 * rotates freely, while the HUD compass independently displays true north.
 * No game-world, save or Babylon dependencies. */
export interface DungeonMapPose {
  readonly x:number;readonly z:number;
  readonly yaw:number;readonly pitch:number;readonly distance:number;
}
export interface DungeonMapPoint {readonly x:number;readonly y:number;readonly z:number}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
export {DUNGEON_NORTH_YAW} from "./dungeonObservationOrientation.ts";
/** CSS compass needle angle: north stays fixed in world space while the
 * actual camera can freely orbit through any number of revolutions. */
export function dungeonNorthNeedleDegrees(yaw:number):number {
  return yaw*180/Math.PI;
}
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
export function orbitDungeonMap(p:DungeonMapPose,dx:number,dy:number):DungeonMapPose{
  return {...p,yaw:p.yaw+dx*.006,
    pitch:clamp(p.pitch+dy*.005,.32,1.48)};
}
export function zoomDungeonMap(p:DungeonMapPose,wheelY:number):DungeonMapPose{
  return {...p,distance:clamp(p.distance*Math.exp(clamp(wheelY,-600,600)*.001),16,115)};
}
export function panDungeonMap(
  p:DungeonMapPose,right:number,forward:number,amount:number,
  bounds:{halfX:number;halfZ:number},
):DungeonMapPose{
  const dx=(Math.cos(p.yaw)*right-Math.sin(p.yaw)*forward)*amount;
  const dz=(Math.sin(p.yaw)*right+Math.cos(p.yaw)*forward)*amount;
  // WASD remains intuitive in SCREEN space after arbitrary camera orbit:
  // W toward the top of the picture, S down, D right and A left.
  return {...p,x:clamp(p.x+dx,-bounds.halfX,bounds.halfX),
    z:clamp(p.z+dz,-bounds.halfZ,bounds.halfZ)};
}
export function mapCameraTarget(p:DungeonMapPose):DungeonMapPoint{
  return {x:p.x,y:0,z:p.z};
}
