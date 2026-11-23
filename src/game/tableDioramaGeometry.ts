import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";

/** Measured usable well inside Galvik's table GLB. Local-space dimensions in
 * metres: the rectangle fills the recess without leaking onto the controls. */
export const TABLE_DIORAMA_WELL={
  width:1.16,depth:.61,centerZ:-.095,baseY:.866,
  floorY:.876,wallY:.921,wallHeight:.086,
} as const;

/** Pure presentation transform. Independent X and Z scales fit square
 * 19×19 and 31×31 layouts into the physical wide rectangular tabletop. */
export function tableDioramaPosition(
  layout:Pick<DungeonLayout,"width"|"height">,point:DungeonPoint,
):{x:number;z:number}{
  return {
    x:(point.x-(layout.width-1)/2)*TABLE_DIORAMA_WELL.width/layout.width,
    z:(point.z-(layout.height-1)/2)*TABLE_DIORAMA_WELL.depth/layout.height,
  };
}
