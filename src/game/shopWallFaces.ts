import { isShopRoomAir, type ShopRoomGeometry, type RoomCell } from "./shopRoomGeometry.ts";

/** Single source of truth for exposed rock boundaries. Every wall separates
 * an air cell from a solid cell; there are no overlapping full rock cubes
 * hiding passages or leaving half-cell holes in the excavation. */
export interface ShopRockFace {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Absent for the locked outer rim and protected entrances. */
  readonly mineCell?: RoomCell;
}

export function shopRockFaces(room: ShopRoomGeometry): ShopRockFace[] {
  if(room.expansionTier===0)return [];
  const faces:ShopRockFace[]=[];
  const limit=7+room.expansionTier*2;
  const isMineable=(cell:RoomCell)=>
    Math.abs(cell.x)>7&&Math.abs(cell.x)<=limit&&Math.abs(cell.z)<=6;
  // The old side wall is replaced by thin rock faces, each with its own
  // click target. These exactly meet the cave floor at x=±7.5.
  for(const side of [-1,1]){
    for(let z=-7;z<=7;z++){
      const next={x:side*8,z};
      if(isShopRoomAir(room,next))continue;
      faces.push({x:side*7.5,z,width:.4,depth:1,
        ...(isMineable(next)?{mineCell:next}:{})});
    }
  }
  // Each dug cell contributes only faces on its exposed solid neighbours,
  // including unmineable outer and end caps.
  for(const entry of room.excavatedCells){
    const [x,z]=entry.split(",").map(Number);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
      const next={x:x+dx,z:z+dz};
      if(isShopRoomAir(room,next))continue;
      faces.push({
        x:x+dx*.5,z:z+dz*.5,
        width:dx!==0?.4:1,depth:dz!==0?.4:1,
        ...(isMineable(next)?{mineCell:next}:{})
      });
    }
  }
  return faces;
}
