import {createLevel5Room,isLevel5Air,isValidLevel5Room,
  type Level5Room,type RoomCell} from "./level5Room.ts";
import {furnitureBounds} from "./furnitureRegistry.ts";
import {CELLAR_FLOOR_Y,CELLAR_ORIGIN_Z} from "./cellarGeometry.ts";

/** A second physical room, but the SAME authoritative excavation rules,
 * cell coordinates, wall-face generator, blueprint validator and world clock.
 * Only the mapping from local cave cells to world coordinates differs. */
export type CellarRoom=Level5Room;
export const createCellarRoom=():CellarRoom=>({
  ...createLevel5Room(),expansionTier:1,
});
export const isValidCellarRoom=(room:unknown):room is CellarRoom=>
  isValidLevel5Room(room)&&
  (room as CellarRoom).expansionTier>=1;
export const cellarLocalCell=(x:number,z:number):RoomCell=>({
  x:Math.floor(x+.5),z:Math.floor(z-CELLAR_ORIGIN_Z+.5),
});
export const isCellarFloor=(room:CellarRoom,x:number,z:number):boolean=>
  isLevel5Air(room,cellarLocalCell(x,z));
export const CELLAR_CHEST_ID="cellar-chest" as const;
export interface CellarChestPlacement {
  readonly id:typeof CELLAR_CHEST_ID;
  readonly x:number;
  readonly z:number;
  readonly rotation:0|1|2|3;
}
export const DEFAULT_CELLAR_CHEST:CellarChestPlacement={
  id:CELLAR_CHEST_ID,x:3,z:CELLAR_ORIGIN_Z,rotation:0,
};
export function cellarChestProblem(
  chest:CellarChestPlacement,room:CellarRoom,
):string|null{
  if(!chest||chest.id!==CELLAR_CHEST_ID||
    !Number.isFinite(chest.x)||!Number.isFinite(chest.z)||
    !Number.isInteger(chest.rotation)||chest.rotation<0||chest.rotation>3||
    Math.abs(chest.x*4-Math.round(chest.x*4))>1e-8||
    Math.abs(chest.z*4-Math.round(chest.z*4))>1e-8)
    return "Invalid cellar chest placement.";
  const b=furnitureBounds(chest);
  // Use the same 0.25m footprint sampling policy as shop shelves; checking
  // just the centre allows the furniture to float over solid rock.
  for(let x=b.minX+.02;x<=b.maxX-.02;x+=.25){
    for(let z=b.minZ+.02;z<=b.maxZ-.02;z+=.25){
      if(!isCellarFloor(room,x,z))return "Excavate floor beneath the entire cellar chest.";
    }
  }
  for(const x of [b.minX+.02,b.maxX-.02])
    for(const z of [b.minZ+.02,b.maxZ-.02])
      if(!isCellarFloor(room,x,z))return "Excavate floor beneath the entire cellar chest.";
  // Keep the stair mouth clear: physical walking, not teleportation.
  if(b.minX<.4&&b.maxX>-2.1&&b.maxZ>-21.0)
    return "Keep the cellar staircase landing clear.";
  return null;
}
export {CELLAR_FLOOR_Y};
