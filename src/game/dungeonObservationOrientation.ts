import type {DungeonPoint} from "./dungeonLayout.ts";

/**
 * The one observation convention for seeded Dungeon floors, not gameplay data.
 * Babylon world +X is screen-right in the north-facing LIVE spectator;
 * world +Z is NORTH (top of the fixed-north minimap).
 *
 * A spectator looks from -Z toward +Z. Galvik approaches the physical
 * table from its furniture-front (+local Z), the opposite end of that view.
 * Rotating ONLY the table's visual diorama by PI around local Y brings its
 * front-facing observation into the same screen-right/screen-up orientation.
 * Furniture P/Q/R rotations remain the independent parent transform.
 */
export const DUNGEON_NORTH_AXIS="+Z" as const;
export const DUNGEON_NORTH_YAW=0;
export const DUNGEON_DEFAULT_PITCH=1.2;
export const DUNGEON_DEFAULT_DISTANCE=70;
export const DUNGEON_WORLD_TILE_SIZE=2.5;
export const TABLE_OBSERVATION_LOCAL_YAW=Math.PI;

/** Read-only grid-to-Babylon placement. No save/topology changes. */
export function dungeonTileWorldCenter(
  layout:{readonly width:number;readonly height:number},point:DungeonPoint,
  tileSize=DUNGEON_WORLD_TILE_SIZE,
):DungeonPoint{
  return {x:(point.x-(layout.width-1)/2)*tileSize,
    z:(point.z-(layout.height-1)/2)*tileSize};
}

/** Pixel origin of a cell in a +Z-up, unrotating minimap. */
export function dungeonTileMinimapPixel(
  tile:DungeonPoint,tilesHigh:number,pixelsPerTile:number,
):{x:number;y:number}{
  return {x:tile.x*pixelsPerTile,
    y:(tilesHigh-1-tile.z)*pixelsPerTile};
}

/** Inverse of the north-up minimap, on unit CSS coordinates. */
export function dungeonTileFromMinimapUV(
  nx:number,ny:number,tilesWide:number,tilesHigh:number,
):DungeonPoint|null{
  if(![nx,ny,tilesWide,tilesHigh].every(Number.isFinite)||
     !Number.isSafeInteger(tilesWide)||tilesWide<=0||
     !Number.isSafeInteger(tilesHigh)||tilesHigh<=0||
     nx<0||nx>=1||ny<0||ny>=1)return null;
  return {x:Math.floor(nx*tilesWide),
    z:tilesHigh-1-Math.floor(ny*tilesHigh)};
}

/** Keep ALL existing paint calls, including hero overlays and fog, in one
 * fixed +Z-up canvas basis. Assigning canvas width/height clears transforms;
 * callers must invoke this after resizing on every fresh render. */
export function orientNorthUpMinimap(
  ctx:Pick<CanvasRenderingContext2D,"setTransform">,pixelHeight:number,
):void{
  ctx.setTransform(1,0,0,-1,0,pixelHeight);
}
