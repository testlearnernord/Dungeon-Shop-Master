import {furnitureBounds,furnitureBoundsOverlap} from "./furnitureRegistry.ts";
import type {Level5Room} from "./level5Room.ts";
import {shelfBounds,type ShopLayout} from "./shopLayout.ts";
import {supportedExcavatedWall,wallFurnitureAtWall,
  type WallFurniturePlacement} from "./wallFurniturePlacement.ts";

export type RosterBoardPlacement=WallFurniturePlacement;
export const DEFAULT_ROSTER_BOARD:RosterBoardPlacement=
  Object.freeze({x:-5.55,z:-6.45,rotation:2});
const quarter=(v:number)=>Math.abs(v*4-Math.round(v*4))<1e-8;
const intersects=furnitureBoundsOverlap;

export function rosterBoardAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
  room?:Level5Room,
):RosterBoardPlacement|null{
  return wallFurnitureAtWall(surface,hit,room,false);
}

export function rosterBoardProblem(
  board:RosterBoardPlacement,layout:ShopLayout,room?:Level5Room,
):string|null{
  if(!board||![board.x,board.z].every(Number.isFinite)||
     !Number.isInteger(board.rotation)||board.rotation<0||board.rotation>3)
    return "Invalid adventurer board placement.";
  const original=board.x===DEFAULT_ROSTER_BOARD.x&&
    board.z===DEFAULT_ROSTER_BOARD.z&&board.rotation===2;
  if(!original&&board.rotation===2&&!quarter(board.x))
    return "Move the board on the wall's 0.25m grid.";
  let box;
  if(board.rotation===2&&board.z===-6.45&&
     ((board.x>=-5.8&&board.x<=-4.2)||(board.x>=4.2&&board.x<=5.8))){
    box=furnitureBounds({id:"adventurer-board",...board});
  }else if((board.rotation===3&&board.x===-7.22)||
           (board.rotation===1&&board.x===7.22)){
    if(!quarter(board.z)||board.z< -5.0||board.z>5.0)
      return "Keep the board within the shop's side wall.";
    box=furnitureBounds({id:"adventurer-board",...board});
  }else if(room&&room.expansionTier>0&&
    supportedExcavatedWall(board,room,layout,3.45)){
    box=furnitureBounds({id:"adventurer-board",...board});
  }else return room?.expansionTier
    ?"Mount the board on a supported shop wall."
    :"Mount the board on a clear main-shop wall.";
  if(room?.expansionTier&&(board.rotation===1||board.rotation===3)&&
     !supportedExcavatedWall(board,room,layout,3.45))
    return "Move the board before excavating its supporting wall.";
  if(layout.shelves.some(shelf=>intersects(box,shelfBounds(shelf),.13)))
    return "The board would be covered by a shelf.";
  return null;
}
export function replaceRosterBoard(
  current:RosterBoardPlacement,next:RosterBoardPlacement,
  layout:ShopLayout,room?:Level5Room,
):{placement:RosterBoardPlacement;message:string}{
  const problem=rosterBoardProblem(next,layout,room);
  if(problem)return {placement:current,message:problem};
  if(current.x===next.x&&current.z===next.z&&current.rotation===next.rotation)
    return {placement:current,message:"Adventurer board placed."};
  return {placement:{x:next.x,z:next.z,rotation:next.rotation},
    message:"Adventurer board placed."};
}
