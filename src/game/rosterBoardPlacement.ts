import {furnitureBounds,furnitureBoundsOverlap} from "./furnitureRegistry.ts";
import {level5RockFaces} from "./level5WallFaces.ts";
import {isLevel5Air,type Level5Room} from "./level5Room.ts";
import {level5FloorWalkable} from "./level5Walkability.ts";
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
  room?:Level5Room,
):RosterBoardPlacement|null{
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  if(surface==="front-wall")
    return {x:snap(hit.x),z:-6.45,rotation:2};
  if(surface==="left-wall")
    return {x:-7.22,z:snap(hit.z),rotation:3};
  if(surface==="right-wall")
    return {x:7.22,z:snap(hit.z),rotation:1};
  if(surface==="rock-wall"&&room){
    const candidates=level5RockFaces(room).filter(face=>
      Math.abs(hit.x-face.x)<=face.width/2+.25&&
      Math.abs(hit.z-face.z)<=face.depth/2+.25);
    // The visible hit is against a *real* boundary of dug air and rock,
    // never an arbitrary screen/world coordinate beyond the mined shop.
    for(const face of candidates){
      if(face.width<face.depth){
        const left=isLevel5Air(room,{x:Math.round(face.x-.5),z:Math.round(face.z)});
        const right=isLevel5Air(room,{x:Math.round(face.x+.5),z:Math.round(face.z)});
        if(left&&!right)return {x:snap(face.x-.28),z:snap(hit.z),rotation:1};
        if(right&&!left)return {x:snap(face.x+.28),z:snap(hit.z),rotation:3};
      }else{
        const north=isLevel5Air(room,{x:Math.round(face.x),z:Math.round(face.z+.5)});
        const south=isLevel5Air(room,{x:Math.round(face.x),z:Math.round(face.z-.5)});
        if(north&&!south)return {x:snap(hit.x),z:snap(face.z+.28),rotation:2};
        if(south&&!north)return {x:snap(hit.x),z:snap(face.z-.28),rotation:0};
      }
    }
  }
  return null;
}
const quarter=(v:number)=>Math.abs(v*4-Math.round(v*4))<1e-8;
const intersects=furnitureBoundsOverlap;

/** A wide wall fixture must have uninterrupted stone beneath its whole
 * frame. One 1m segment is NOT sufficient for a 3.45m noticeboard.
 * This checks current exposed rock faces, so a pickaxe cannot silently
 * delete the supporting wall of a persisted board.
 */
function supportedExcavatedWall(
  board:RosterBoardPlacement,room:Level5Room,layout:ShopLayout,
):boolean{
  const faces=level5RockFaces(room);
  const vertical=board.rotation===1||board.rotation===3;
  const plane=vertical
    ?board.x+(board.rotation===1?.28:-.28)
    :board.z+(board.rotation===2?-.28:.28);
  for(let step=-1.5;step<=1.5;step+=.25){
    const sample=vertical?board.z+step:board.x+step;
    const supported=faces.some(face=>
      (vertical?face.width<face.depth:face.depth<face.width)&&
      Math.abs((vertical?face.x:face.z)-plane)<.12&&
      Math.abs((vertical?face.z:face.x)-sample)<.48);
    if(!supported)return false;
  }
  const outward=board.rotation===1?{x:-.65,z:0}
    :board.rotation===3?{x:.65,z:0}
    :board.rotation===2?{x:0,z:.65}:{x:0,z:-.65};
  return level5FloorWalkable({
    x:board.x+outward.x,z:board.z+outward.z,
  },room,layout,.25);
}

export function rosterBoardProblem(
  board:RosterBoardPlacement,layout:ShopLayout,room?:Level5Room,
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
    box=furnitureBounds({id:"adventurer-board",...board});
  }else if((board.rotation===3&&board.x===-7.22)||
           (board.rotation===1&&board.x===7.22)){
    if(!quarter(board.z)||board.z< -5.0||board.z>5.0)
      return "Keep the board within the shop's side wall.";
    box=furnitureBounds({id:"adventurer-board",...board});
  }else if(room&&room.expansionTier>0&&
    supportedExcavatedWall(board,room,layout)){
    box=furnitureBounds({id:"adventurer-board",...board});
  }else return room?.expansionTier
    ?"Mount the board on a supported shop wall."
    :"Mount the board on a clear main-shop wall.";
  // A legacy side-wall board also requires real support after the player
  // opens those original stones. The old full wall may now be disabled.
  if(room?.expansionTier&&
     (board.rotation===1||board.rotation===3)&&
     !supportedExcavatedWall(board,room,layout))
    return "Move the board before excavating its supporting wall.";
  if(layout.shelves.some(shelf=>intersects(box,shelfBounds(shelf),0.13)))
    return "The board would be covered by a shelf.";
  return null;
}
export function replaceRosterBoard(
  current:RosterBoardPlacement|undefined,next:RosterBoardPlacement,
  layout:ShopLayout,room?:Level5Room,
):{placement:RosterBoardPlacement|undefined;message:string}{
  const problem=rosterBoardProblem(next,layout,room);
  if(problem)return {placement:current,message:problem};
  const old=current??DEFAULT_ROSTER_BOARD;
  if(old.x===next.x&&old.z===next.z&&old.rotation===next.rotation)
    return {placement:current,message:"Adventurer board placed."};
  return {placement:{x:next.x,z:next.z,rotation:next.rotation},
    message:"Adventurer board placed."};
}
