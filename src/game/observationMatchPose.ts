import type {DungeonLayout} from "./dungeonLayout.ts";
import {DUNGEON_DEFAULT_PITCH,DUNGEON_NORTH_YAW,
  DUNGEON_WORLD_TILE_SIZE} from "./dungeonObservationOrientation.ts";
import {mapCameraPosition,type DungeonMapPose} from "./dungeonMapCamera.ts";
import {TABLE_DIORAMA_WELL,tableDioramaFit} from "./tableDioramaGeometry.ts";

/** Both Babylon scenes must agree on the *projected frame* at the handoff.
 * The tabletop remains a separately scaled, rotated physical miniature.
 * No GameState / world tick / saved geometry is ever changed here.
 */
export const OBSERVATION_MATCH_FOV=.92;
export const OBSERVATION_SHOP_FLIGHT_SECONDS=1.05;
export const OBSERVATION_LIVE_SETTLE_SECONDS=.42;

export interface ObservationPoint3 {
  readonly x:number;readonly y:number;readonly z:number;
}
export interface ObservationMatchPose {
  readonly live:DungeonMapPose;
  readonly tableEye:ObservationPoint3;
  readonly tableTarget:ObservationPoint3;
  readonly fov:number;
}

/** Coordinates are relative to the movable table FURNITURE root. Its child
 * diorama already has a PI yaw, so world -Z maps to table-front local +Z.
 * A separate scale on each floor axis is necessary for the rectangular
 * real-life recess. Depth and height are paired to preserve the pitch.
 */
export function observationMatchPose(
  layout:Pick<DungeonLayout,"width"|"height">,
):ObservationMatchPose{
  if(!Number.isSafeInteger(layout.width)||layout.width<=0||
     !Number.isSafeInteger(layout.height)||layout.height<=0)
    throw new RangeError("Observation needs a valid floor grid");
  const fit=tableDioramaFit(layout);
  const span=Math.max(layout.width,layout.height)*DUNGEON_WORLD_TILE_SIZE;
  const live:DungeonMapPose={
    x:0,z:0,yaw:DUNGEON_NORTH_YAW,pitch:DUNGEON_DEFAULT_PITCH,
    distance:Math.max(27,span*.58),
  };
  const eye=mapCameraPosition(live);
  const scaleX=fit.tileWidth/DUNGEON_WORLD_TILE_SIZE;
  const scaleZ=fit.tileDepth/DUNGEON_WORLD_TILE_SIZE;
  return {
    live,
    tableEye:{
      x:-eye.x*scaleX,
      y:TABLE_DIORAMA_WELL.floorY+eye.y*scaleZ,
      z:TABLE_DIORAMA_WELL.centerZ-eye.z*scaleZ,
    },
    tableTarget:{
      x:0,y:TABLE_DIORAMA_WELL.floorY,z:TABLE_DIORAMA_WELL.centerZ,
    },
    fov:OBSERVATION_MATCH_FOV,
  };
}

export const observationEase=(t:number):number=>{
  const x=Math.max(0,Math.min(1,t));
  return x*x*(3-2*x);
};

/** Visual shadow peaks at the scene exchange, but the centre never goes
 * fully black. The exact same layer persists across the two renderers. */
export function observationVeil(phase:"shop"|"live",progress:number):number{
  const t=Math.max(0,Math.min(1,progress));
  return phase==="shop"
    ?observationEase((t-.50)/.50)*.93
    :(1-observationEase(t))*.93;
}
