import {shopRockFaces} from "./shopWallFaces.ts";
import {isShopRoomAir,type ShopRoomGeometry} from "./shopRoomGeometry.ts";
import {shopFloorWalkable} from "./shopWalkability.ts";
import type {ShopLayout} from "./shopLayout.ts";
import {isSealedPassageWallHit} from "./shopPortal.ts";

export interface WallFurniturePlacement{
  readonly x:number;
  readonly z:number;
  readonly rotation:0|1|2|3;
}
const snap=(n:number)=>Math.round(n*4)/4;

export function wallFurnitureAtWall(
  surface:string,hit:{readonly x:number;readonly z:number},
  room?:ShopRoomGeometry,allowBack=false,
):WallFurniturePlacement|null{
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  if(surface==="back-wall"&&isSealedPassageWallHit(hit))return null;
  if(surface==="front-wall")return {x:snap(hit.x),z:-6.45,rotation:2};
  if(surface==="back-wall"&&allowBack)return {x:snap(hit.x),z:6.45,rotation:0};
  if(surface==="left-wall")return {x:-7.22,z:snap(hit.z),rotation:3};
  if(surface==="right-wall")return {x:7.22,z:snap(hit.z),rotation:1};
  if(surface!=="rock-wall"||!room)return null;
  const candidates=shopRockFaces(room).filter(face=>
    Math.abs(hit.x-face.x)<=face.width/2+.25&&
    Math.abs(hit.z-face.z)<=face.depth/2+.25);
  for(const face of candidates){
    if(face.width<face.depth){
      const left=isShopRoomAir(room,{x:Math.round(face.x-.5),z:Math.round(face.z)});
      const right=isShopRoomAir(room,{x:Math.round(face.x+.5),z:Math.round(face.z)});
      if(left&&!right)return {x:snap(face.x-.28),z:snap(hit.z),rotation:1};
      if(right&&!left)return {x:snap(face.x+.28),z:snap(hit.z),rotation:3};
    }else{
      const north=isShopRoomAir(room,{x:Math.round(face.x),z:Math.round(face.z+.5)});
      const south=isShopRoomAir(room,{x:Math.round(face.x),z:Math.round(face.z-.5)});
      if(north&&!south)return {x:snap(hit.x),z:snap(face.z+.28),rotation:2};
      if(south&&!north)return {x:snap(hit.x),z:snap(face.z-.28),rotation:0};
    }
  }
  return null;
}

export function supportedExcavatedWall(
  placement:WallFurniturePlacement,room:ShopRoomGeometry,layout:ShopLayout,width:number,
):boolean{
  const faces=shopRockFaces(room);
  const vertical=placement.rotation===1||placement.rotation===3;
  const plane=vertical
    ?placement.x+(placement.rotation===1?.28:-.28)
    :placement.z+(placement.rotation===2?-.28:.28);
  const half=width/2-.09;
  for(let step=-half;step<=half+.25;step+=.25){
    const offset=Math.min(step,half);
    const sample=vertical?placement.z+offset:placement.x+offset;
    const supported=faces.some(face=>
      (vertical?face.width<face.depth:face.depth<face.width)&&
      Math.abs((vertical?face.x:face.z)-plane)<.12&&
      Math.abs((vertical?face.z:face.x)-sample)<=.5001);
    if(!supported)return false;
  }
  const outward=placement.rotation===1?{x:-.65,z:0}
    :placement.rotation===3?{x:.65,z:0}
    :placement.rotation===2?{x:0,z:.65}:{x:0,z:-.65};
  return shopFloorWalkable({
    x:placement.x+outward.x,z:placement.z+outward.z,
  },room,layout,.25);
}
