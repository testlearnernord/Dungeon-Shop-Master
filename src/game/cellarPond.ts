import type {CellarRoom} from "./cellarRoom.ts";
import {CELLAR_ORIGIN_Z} from "./cellarRoom.ts";
import type {RoomCell} from "./shopRoomGeometry.ts";

/** The pond is not a separate building action. Galvik reveals its basin by
 * mining a connected six-cell pocket with the existing U excavation tool. */
export const POND_CELLS:readonly RoomCell[]=[
  {x:-8,z:-1},{x:-8,z:0},{x:-8,z:1},
  {x:-9,z:-1},{x:-9,z:0},{x:-9,z:1},
] as const;
export const isPondBasinCell=(cell:RoomCell):boolean=>
  POND_CELLS.some(c=>c.x===cell.x&&c.z===cell.z);
export const POND_CENTER={x:-8.5,z:CELLAR_ORIGIN_Z} as const;
export const POND_WIDTH=2, POND_LENGTH=3;
export function pondExcavationRemaining(room:CellarRoom):number{
  return POND_CELLS.filter(c=>!room.excavatedCells.includes(c.x+","+c.z)).length;
}
export const isCellarPondUncovered=(room:CellarRoom):boolean=>
  pondExcavationRemaining(room)===0;
