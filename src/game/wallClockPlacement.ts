import {furnitureBounds,furnitureBoundsOverlap} from "./furnitureRegistry.ts";
import type {ShopRoomGeometry} from "./shopRoomGeometry.ts";
import {shelfBounds,type ShopLayout} from "./shopLayout.ts";
import type {RosterBoardPlacement} from "./rosterBoardPlacement.ts";
import type {WallPortraitPlacement} from "./wallPortraitPlacement.ts";
import {wallFurnitureAtWall,supportedExcavatedWall,
  type WallFurniturePlacement} from "./wallFurniturePlacement.ts";

export type WallClockPlacement=WallFurniturePlacement;
/** Mounted on the near-side stone wall, visible from Galvik's sales floor.
 * Same wall transforms as the Adventurer Board and portrait. */
export const DEFAULT_WALL_CLOCK:WallClockPlacement=
  Object.freeze({x:-7.22,z:0,rotation:3});
const quarter=(v:number)=>Math.abs(v*4-Math.round(v*4))<1e-8;
const width=2.52;
const half=width/2+.10;
export function wallClockAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
  room?:ShopRoomGeometry,
):WallClockPlacement|null{
  return wallFurnitureAtWall(surface,hit,room,true);
}
export function wallClockProblem(
  pose:WallClockPlacement,layout:ShopLayout,room:ShopRoomGeometry,
  board:RosterBoardPlacement,portrait?:WallPortraitPlacement,
):string|null{
  if(!pose||![pose.x,pose.z].every(Number.isFinite)||
    !Number.isInteger(pose.rotation)||pose.rotation<0||pose.rotation>3)
    return "Invalid world clock placement.";
  const front=pose.rotation===2&&pose.z===-6.45&&
    (pose.x>=-7.5+half&&pose.x<=-2.5-half||
     pose.x>=2.5+half&&pose.x<=7.5-half);
  const back=pose.rotation===0&&pose.z===6.45&&
    (Math.abs(pose.x)<=2.75-half||
     Math.abs(pose.x)>=5.25+half&&Math.abs(pose.x)<=7.5-half);
  const left=pose.rotation===3&&pose.x===-7.22;
  const right=pose.rotation===1&&pose.x===7.22;
  const side=(left||right)&&pose.z>=-7+half&&pose.z<=7-half;
  const rock=room.expansionTier>0&&
    supportedExcavatedWall(pose,room,layout,width);
  const snapped=(front||back)?quarter(pose.x):
    side?quarter(pose.z):quarter(pose.x)&&quarter(pose.z);
  if(!front&&!back&&!side&&!rock)
    return "Hang the clock on continuous solid shop wall, not an exit or open air.";
  if(!snapped)return "Clock placement must snap to the wall grid.";
  if(side&&room.expansionTier>0&&!supportedExcavatedWall(
    pose,room,layout,width))
    return "The clock's supporting wall was mined away.";
  const bounds=furnitureBounds({id:"world-clock",...pose});
  if(layout.shelves.some(shelf=>furnitureBoundsOverlap(
    bounds,shelfBounds(shelf),.12)))
    return "The world clock would be hidden by a shelf.";
  if(furnitureBoundsOverlap(bounds,
    furnitureBounds({id:"counter",...layout.counter}),.10))
    return "The world clock overlaps the checkout counter.";
  if(furnitureBoundsOverlap(bounds,
    furnitureBounds({id:"adventurer-board",...board}),.10))
    return "The world clock overlaps the Adventurer Board.";
  if(portrait&&furnitureBoundsOverlap(bounds,
    furnitureBounds({id:"galvik-portrait",...portrait}),.10))
    return "The world clock overlaps the portrait.";
  return null;
}
