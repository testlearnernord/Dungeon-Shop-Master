import {furnitureBounds,furnitureBoundsOverlap} from "./furnitureRegistry.ts";
import {rosterBoardAtWall,supportedExcavatedWall,
  DEFAULT_ROSTER_BOARD,type RosterBoardPlacement} from "./rosterBoardPlacement.ts";
import {shelfBounds,type ShopLayout} from "./shopLayout.ts";
import type {Level5Room} from "./level5Room.ts";

/** One-of-a-kind decoration, sharing the Adventurer Board's rock-wall anchors. */
export type WallPortraitPlacement=RosterBoardPlacement;
const snap=(value:number)=>Math.round(value*4)/4;
const quarter=(value:number)=>Math.abs(value*4-Math.round(value*4))<1e-8;
const width=1.08,half=width/2+.08;

export function wallPortraitAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
  room?:Level5Room,
):WallPortraitPlacement|null{
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  if(surface==="back-wall")return {x:snap(hit.x),z:6.45,rotation:0};
  return rosterBoardAtWall(surface,hit,room);
}

/** Used by preview, committed placement, strict saves and mining support. */
export function wallPortraitProblem(
  pose:WallPortraitPlacement,layout:ShopLayout,room?:Level5Room,
  board:RosterBoardPlacement=DEFAULT_ROSTER_BOARD,
):string|null{
  if(!pose||![pose.x,pose.z].every(Number.isFinite)||
    !Number.isInteger(pose.rotation)||pose.rotation<0||pose.rotation>3)
    return "Invalid wall portrait placement.";
  if(!quarter(pose.x)||!quarter(pose.z))
    return "Hang the portrait on the wall's 0.25m grid.";
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
  if(!front&&!back&&!onSide&&!rock)
    return "Hang the portrait on an existing solid shop wall, not a doorway or empty air.";
  if(onSide&&room?.expansionTier&&
    !supportedExcavatedWall(pose,room,layout,width))
    return "Move the portrait before excavating its supporting wall.";
  const box=furnitureBounds({id:"galvik-portrait",...pose});
  if(layout.shelves.some(shelf=>
    furnitureBoundsOverlap(box,shelfBounds(shelf),.10)))
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
