import {
  SHOP_FLOOR_FURNITURE,shopFixtureBounds,shopFixtureTouches,
  type ShopFloorBounds,type ShopFloorPoint,type QuarterTurn,
} from "./shopFloorFurniture.ts";

/** All CURRENT movable furniture, including wall and private-room fixtures.
 * Geometry and mounting semantics live here; GameStore, the blueprint,
 * player collisions and shop navigation use the same definitions.
 */
export type FurnitureKind="shelf-1"|"shelf-2"|"counter"|
  "desk"|"chest"|"candle"|"bed"|"adventurer-board";
export type FurnitureMount="shop-floor"|"private-floor"|"shop-wall";
export type FurniturePurpose="stock"|"checkout"|"sleep"|"debt"|"storage"|
  "light"|"roster";
export type FurniturePoint=ShopFloorPoint;
export type FurnitureBounds=ShopFloorBounds;
export interface FurniturePose {
  readonly id:FurnitureKind;
  readonly x:number;
  readonly z:number;
  readonly rotation:QuarterTurn;
}
export interface FurnitureDefinition {
  readonly mount:FurnitureMount;
  readonly purpose:FurniturePurpose;
  readonly width:number;
  readonly depth:number;
  readonly height:number;
  readonly collides:boolean;
  readonly interaction?:{readonly reach:number;readonly label:string};
  readonly customerService?: "shelf"|"checkout";
}
const shelf=SHOP_FLOOR_FURNITURE.shelf;
const counter=SHOP_FLOOR_FURNITURE.counter;
const shelfDefinition={
  mount:"shop-floor",purpose:"stock",width:shelf.preview.width,
  depth:shelf.preview.depth,height:shelf.preview.height,
  collides:true,customerService:"shelf",
} as const;
export const FURNITURE_REGISTRY={
  "shelf-1":shelfDefinition,
  "shelf-2":shelfDefinition,
  counter:{
    mount:"shop-floor",purpose:"checkout",width:counter.preview.width,
    depth:counter.preview.depth,height:counter.preview.height,
    collides:true,customerService:"checkout",
  },
  desk:{mount:"private-floor",purpose:"debt",width:1.18,depth:.76,
    height:1.25,collides:true,interaction:{reach:1.8,label:"Book of Debts"}},
  chest:{mount:"private-floor",purpose:"storage",width:1.04,depth:.72,
    height:.9,collides:true},
  candle:{mount:"private-floor",purpose:"light",width:.66,depth:.66,
    height:1.2,collides:true},
  bed:{mount:"private-floor",purpose:"sleep",width:1.74,depth:2.70,
    height:1.55,collides:true,interaction:{reach:2,label:"Sleep"}},
  "adventurer-board":{mount:"shop-wall",purpose:"roster",
    width:3.45,depth:.22,height:2.25,collides:false,
    interaction:{reach:2.2,label:"Adventurers"}},
} as const satisfies Record<FurnitureKind,FurnitureDefinition>;

export const furnitureDefinition=(id:FurnitureKind):FurnitureDefinition=>
  FURNITURE_REGISTRY[id];

export function furnitureBounds(p:FurniturePose):FurnitureBounds {
  if(p.id==="shelf-1"||p.id==="shelf-2")
    return shopFixtureBounds("shelf",p);
  if(p.id==="counter")return shopFixtureBounds("counter",p);
  const def=FURNITURE_REGISTRY[p.id];
  const turn=p.rotation%2===1;
  const w=turn?def.depth:def.width,d=turn?def.width:def.depth;
  return {minX:p.x-w/2,maxX:p.x+w/2,
    minZ:p.z-d/2,maxZ:p.z+d/2};
}
export function furnitureSolidBounds(p:FurniturePose):FurnitureBounds {
  if(p.id==="shelf-1"||p.id==="shelf-2")
    return shopFixtureBounds("shelf",p,"solid");
  if(p.id==="counter")return shopFixtureBounds("counter",p,"solid");
  return furnitureBounds(p);
}
export function furnitureTouchesActor(
  p:FurniturePose,actor:{readonly x:number;readonly z:number;
    readonly radius:number},
):boolean {
  if(!FURNITURE_REGISTRY[p.id].collides)return false;
  if(p.id==="shelf-1"||p.id==="shelf-2")
    return shopFixtureTouches("shelf",p,actor,actor.radius);
  if(p.id==="counter")
    return shopFixtureTouches("counter",p,actor,actor.radius);
  if(!Number.isFinite(actor.x)||!Number.isFinite(actor.z)||
     !Number.isFinite(actor.radius)||actor.radius<0)return false;
  const b=furnitureSolidBounds(p);
  return actor.x+actor.radius>b.minX&&actor.x-actor.radius<b.maxX&&
    actor.z+actor.radius>b.minZ&&actor.z-actor.radius<b.maxZ;
}
export function furnitureBoundsOverlap(
  a:FurnitureBounds,b:FurnitureBounds,pad=0,
):boolean {
  return a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&
    a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;
}
export const isFurnitureKind=(id:unknown):id is FurnitureKind=>
  typeof id==="string"&&Object.hasOwn(FURNITURE_REGISTRY,id);
