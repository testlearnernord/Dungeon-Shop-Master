import {furnitureBounds,furnitureBoundsOverlap} from "./furnitureRegistry.ts";
import {DEFAULT_ROSTER_BOARD,type RosterBoardPlacement} from "./rosterBoardPlacement.ts";
import {shelfBounds,type ShopLayout} from "./shopLayout.ts";
import type {Level5Room} from "./level5Room.ts";
import {supportedExcavatedWall,wallFurnitureAtWall,
  type WallFurniturePlacement} from "./wallFurniturePlacement.ts";

export type WallPortraitPlacement=WallFurniturePlacement;
const quarter=(value:number)=>Math.abs(value*4-Math.round(value*4))<1e-8;
const width=1.08,half=width/2+.08;

export function wallPortraitAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
  room?:Level5Room,
):WallPortraitPlacement|null{
  return wallFurnitureAtWall(surface,hit,room,true);
}

export function wallPortraitProblem(
  pose:WallPortraitPlacement,layout:ShopLayout,room?:Level5Room,
  board:RosterBoardPlacement=DEFAULT_ROSTER_BOARD,
):string|null{
  if(!pose||![pose.x,pose.z].every(Number.isFinite)||
    !Number.isInteger(pose.rotation)||pose.rotation<0||pose.rotation>3)
    return "Invalid wall portrait placement.";
  const front=pose.rotation===2&&pose.z===-6.45&&
    Math.abs(pose.x)>=2.5+half&&Math.abs(pose.x)<=7.5-half;
  const back=pose.rotation===0&&pose.z===6.45&&(
    Math.abs(pose.x)<=2.75-half||
    (Math.abs(pose.x)>=5.25+half&&Math.abs(pose.x)<=7.5-half));
  const side=(pose.rotation===3&&pose.x===-7.22)||
    (pose.rotation===1&&pose.x===7.22);
  const onSide=side&&pose.z>=-7+half&&pose.z<=7-half;
  const rock=room&&room.expansionTier>0&&
    supportedExcavatedWall(pose,room,layout,width);
  const snapped=front||back?quarter(pose.x):
    onSide?quarter(pose.z):quarter(pose.x)&&quarter(pose.z);
  if(!front&&!back&&!onSide&&!rock)
    return "Hang the portrait on an existing solid shop wall, not a doorway or empty air.";
  if(!snapped)return "Hang the portrait on the wall's 0.25m grid.";
  if(onSide&&room?.expansionTier&&
    !supportedExcavatedWall(pose,room,layout,width))
    return "Move the portrait before excavating its supporting wall.";
  const box=furnitureBounds({id:"galvik-portrait",...pose});
  if(layout.shelves.some(shelf=>furnitureBoundsOverlap(box,shelfBounds(shelf),.10)))
    return "The portrait would be covered by a shelf.";
  if(furnitureBoundsOverlap(box,
    furnitureBounds({id:"adventurer-board",...board}),.08))
    return "The portrait overlaps the Adventurer Board.";
  return null;
}

export function replaceWallPortrait(
  current:WallPortraitPlacement|undefined,next:WallPortraitPlacement,
  layout:ShopLayout,room?:Level5Room,
  board:RosterBoardPlacement=DEFAULT_ROSTER_BOARD,
):{placement:WallPortraitPlacement|undefined;message:string}{
  const problem=wallPortraitProblem(next,layout,room,board);
  if(problem)return {placement:current,message:problem};
  if(current?.x===next.x&&current.z===next.z&&current.rotation===next.rotation)
    return {placement:current,message:"Portrait hung."};
  return {placement:{x:next.x,z:next.z,rotation:next.rotation},
    message:"Portrait hung."};
}
