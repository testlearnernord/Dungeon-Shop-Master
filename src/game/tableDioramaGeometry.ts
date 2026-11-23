import type {DungeonLayout,DungeonPoint} from "./dungeonLayout.ts";

/** Measured usable well inside Galvik's table GLB, in furniture-local metres. */
export const TABLE_DIORAMA_WELL={
  width:1.16,depth:.61,centerZ:-.095,baseY:.866,
  floorY:.876,wallY:.919,wallHeight:.078,
} as const;

/** Maximum harmless X/Z stretch of a dungeon tile, independent of floor size.
 * All additional recess area becomes real stone cutaway, never black bars. */
export const MAX_DIORAMA_TILE_STRETCH=1.30;

export interface TableDioramaFit {
  readonly coreWidth:number;
  readonly coreDepth:number;
  readonly borderX:number;
  readonly borderZ:number;
  readonly tileWidth:number;
  readonly tileDepth:number;
}

/** Fit a square-like LIVE tile grid into a non-square physical recess.
 * We preserve near-square corridors and use symmetric authored bedrock banks
 * to fill the remaining area. Both axes are bounded by the actual GLB well.
 * This is pure display geometry: the seed, topology and saved x/z stay intact.
 */
export function tableDioramaFit(
  layout:Pick<DungeonLayout,"width"|"height">,
):TableDioramaFit{
  if(layout.width<=0||layout.height<=0)
    throw new RangeError("Dungeon layout dimensions must be positive");
  const mapAspect=layout.width/layout.height;
  const recessAspect=TABLE_DIORAMA_WELL.width/TABLE_DIORAMA_WELL.depth;
  const aspect=Math.max(mapAspect/MAX_DIORAMA_TILE_STRETCH,
    Math.min(mapAspect*MAX_DIORAMA_TILE_STRETCH,recessAspect));
  const coreWidth=Math.min(TABLE_DIORAMA_WELL.width,
    TABLE_DIORAMA_WELL.depth*aspect);
  const coreDepth=Math.min(TABLE_DIORAMA_WELL.depth,
    TABLE_DIORAMA_WELL.width/aspect);
  return {
    coreWidth,coreDepth,
    borderX:Math.max(0,(TABLE_DIORAMA_WELL.width-coreWidth)/2),
    borderZ:Math.max(0,(TABLE_DIORAMA_WELL.depth-coreDepth)/2),
    tileWidth:coreWidth/layout.width,
    tileDepth:coreDepth/layout.height,
  };
}

/** Canonical tile centers for BOTH the miniature masonry and its LIVE props. */
export function tableDioramaPosition(
  layout:Pick<DungeonLayout,"width"|"height">,point:DungeonPoint,
):{x:number;z:number}{
  const fit=tableDioramaFit(layout);
  return {
    x:(point.x-(layout.width-1)/2)*fit.tileWidth,
    z:(point.z-(layout.height-1)/2)*fit.tileDepth,
  };
}
