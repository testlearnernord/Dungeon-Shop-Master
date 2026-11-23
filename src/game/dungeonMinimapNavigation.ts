import type {DungeonPoint} from "./dungeonLayout.ts";
import {dungeonTileFromMinimapUV} from "./dungeonObservationOrientation.ts";

export interface MinimapBounds{
  readonly left:number;readonly top:number;
  readonly width:number;readonly height:number;
}

/** Map read-only browser coordinates to the *actual* rendered dungeon cell.
 * CSS can scale the canvas independently of its backing pixel dimensions. */
export function minimapPointFromClient(
  clientX:number,clientY:number,bounds:MinimapBounds,
  tilesWide:number,tilesHigh:number,
  explored?:ReadonlySet<number>,
):DungeonPoint|null{
  if(![clientX,clientY,bounds.left,bounds.top,bounds.width,bounds.height,
    tilesWide,tilesHigh].every(Number.isFinite)||
    bounds.width<=0||bounds.height<=0||
    !Number.isSafeInteger(tilesWide)||tilesWide<=0||
    !Number.isSafeInteger(tilesHigh)||tilesHigh<=0)return null;
  const nx=(clientX-bounds.left)/bounds.width;
  const ny=(clientY-bounds.top)/bounds.height;
  const cell=dungeonTileFromMinimapUV(nx,ny,tilesWide,tilesHigh);
  return cell&&isKnownMinimapCell(cell,tilesWide,tilesHigh,explored)
    ?cell:null;
}

/** A selected hero never gets an omniscient camera jump into black fog.
 * The neutral spectator has explicit whole-floor knowledge. */
export function isKnownMinimapCell(
  cell:DungeonPoint,tilesWide:number,tilesHigh:number,
  explored?:ReadonlySet<number>,
):boolean{
  return Number.isInteger(cell.x)&&Number.isInteger(cell.z)&&
    cell.x>=0&&cell.z>=0&&cell.x<tilesWide&&cell.z<tilesHigh&&
    (explored===undefined||explored.has(cell.z*tilesWide+cell.x));
}
