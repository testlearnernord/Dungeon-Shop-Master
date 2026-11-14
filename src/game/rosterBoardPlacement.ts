import {shelfBounds,type ShopLayout} from "./shopLayout.ts";

/** The roster is a wall-mounted, non-colliding noticeboard. Placement
 * rotates the complete board and frame while its E/R interaction follows
 * the actual mesh. The original anchor is deliberately retained for saves.
 */
export interface RosterBoardPlacement{
  readonly x:number;
  readonly z:number;
  readonly rotation:0|1|2|3;
}
export const DEFAULT_ROSTER_BOARD:RosterBoardPlacement=
  Object.freeze({x:-5.55,z:-6.45,rotation:2});

export type RosterWall="front-wall"|"left-wall"|"right-wall";
const snap=(n:number)=>Math.round(n*4)/4;
export function rosterBoardAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
):RosterBoardPlacement|null{
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  if(surface==="front-wall")
    return {x:snap(hit.x),z:-6.45,rotation:2};
  if(surface==="left-wall")
    return {x:-7.22,z:snap(hit.z),rotation:3};
  if(surface==="right-wall")
    return {x:7.22,z:snap(hit.z),rotation:1};
  return null;
}
const quarter=(v:number)=>Math.abs(v*4-Math.round(v*4))<1e-8;
const intersects=(a:{minX:number;maxX:number;minZ:number;maxZ:number},
  b:{minX:number;maxX:number;minZ:number;maxZ:number},pad:number)=>
  a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&
  a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;
export function rosterBoardProblem(
  board:RosterBoardPlacement,layout:ShopLayout,
):string|null{
  if(!board||![board.x,board.z].every(Number.isFinite)||
     !Number.isInteger(board.rotation)||board.rotation<0||board.rotation>3)
    return "Invalid adventurer board placement.";
  const original=board.x===DEFAULT_ROSTER_BOARD.x&&
    board.z===DEFAULT_ROSTER_BOARD.z&&board.rotation===2;
  // The hand-placed old coordinates intentionally do not use a grid snap.
  if(!original&&board.rotation===2&&!quarter(board.x))
    return "Move the board on the wall's 0.25m grid.";
  let box;
  if(board.rotation===2&&board.z===-6.45&&
     ((board.x>=-5.8&&board.x<=-4.2)||
      (board.x>=4.2&&board.x<=5.8))){
    box={minX:board.x-1.69,maxX:board.x+1.69,
      minZ:board.z-0.12,maxZ:board.z+0.12};
  }else if((board.rotation===3&&board.x===-7.22)||
           (board.rotation===1&&board.x===7.22)){
    if(!quarter(board.z)||board.z< -5.0||board.z>5.0)
      return "Keep the board within the shop's side wall.";
    box={minX:board.x-0.12,maxX:board.x+0.12,
      minZ:board.z-1.69,maxZ:board.z+1.69};
  }else return "Mount the board on a clear main-shop wall.";
  // A noticeboard must remain visible, not embedded into a moved shelf.
  if(layout.shelves.some(shelf=>intersects(box,shelfBounds(shelf),0.13)))
    return "The board would be covered by a shelf.";
  return null;
}
export function replaceRosterBoard(
  current:RosterBoardPlacement|undefined,next:RosterBoardPlacement,
  layout:ShopLayout,
):{placement:RosterBoardPlacement|undefined;message:string}{
  const problem=rosterBoardProblem(next,layout);
  if(problem)return {placement:current,message:problem};
  const old=current??DEFAULT_ROSTER_BOARD;
  if(old.x===next.x&&old.z===next.z&&old.rotation===next.rotation)
    return {placement:current,message:"Adventurer board placed."};
  return {placement:{x:next.x,z:next.z,rotation:next.rotation},
    message:"Adventurer board placed."};
}
