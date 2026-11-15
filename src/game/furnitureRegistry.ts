/** Canonical geometry for furniture that occupies the public Floor-5 shop.
 * This is deliberately independent of Babylon, the economy and save I/O.
 * A furniture type has a support/placement footprint, a physical collision
 * hull, a visual preview/focus, and service sockets. These are distinct.
 * Bedroom props and wall-mounted boards are separate placement domains.
 */
export type ShopFloorKind="shelf"|"counter";
export type QuarterTurn=0|1|2|3;
export interface ShopFloorTransform {
  readonly x:number;
  readonly z:number;
  readonly rotation:QuarterTurn;
}
export interface ShopFloorPoint {readonly x:number;readonly z:number}
export interface ShopFloorBounds {
  readonly minX:number;readonly maxX:number;
  readonly minZ:number;readonly maxZ:number;
}
export interface ShopFloorVisual {
  readonly width:number;readonly depth:number;readonly height:number;
  readonly offsetX:number;readonly offsetY:number;readonly offsetZ:number;
}
interface ShopFloorDefinition {
  readonly footprint:ShopFloorBounds;
  readonly solid:ShopFloorBounds;
  readonly preview:ShopFloorVisual;
  readonly focus:Pick<ShopFloorVisual,"width"|"depth"|"height">;
  readonly service:
    |{readonly outward:number;readonly slots:number;readonly slotSpacing:number}
    |{readonly visitorGap:number;readonly staffGap:number;
      readonly queueSpacing:number;readonly queueCapacity:number};
  readonly body?:{readonly width:number;readonly depth:number};
  readonly register?:ShopFloorPoint;
}

/** Every new public-shop fixture must be registered here AND given a
 * persisted layout identity, scene mesh, service behavior and integration
 * coverage. A catalog entry alone never makes furniture playable.
 */
export const SHOP_FLOOR_FURNITURE={
  shelf:{
    // Coordinates relative to the unrotated shelf root. Its back does not
    // sit at the root's centre; keeping this offset avoids wall clipping.
    footprint:{minX:-0.16,maxX:1.16,minZ:-3.02,maxZ:3.02},
    solid:{minX:-0.16,maxX:1.16,minZ:-3.02,maxZ:3.02},
    preview:{width:1.36,depth:6.1,height:2.35,
      offsetX:0.48,offsetY:1.27,offsetZ:0},
    focus:{width:1.36,depth:6.1,height:2.35},
    service:{outward:1.75,slots:5,slotSpacing:1},
  },
  counter:{
    // The larger footprint protects the cashier and first visitor socket;
    // the physical solid is only the rendered countertop.
    footprint:{minX:-1.075,maxX:1.075,minZ:-0.9,maxZ:0.9},
    solid:{minX:-0.775,maxX:0.775,minZ:-0.465,maxZ:0.465},
    preview:{width:2.15,depth:1.8,height:1.25,
      offsetX:0,offsetY:0.64,offsetZ:0},
    focus:{width:1.55,depth:0.93,height:1.38},
    service:{visitorGap:0.65,staffGap:0.58,
      queueSpacing:1.3,queueCapacity:5},
    body:{width:1.35,depth:0.75},
    register:{x:0.28,z:0.04},
  },
} as const satisfies Record<ShopFloorKind,ShopFloorDefinition>;

export function turnShopOffset(
  x:number,z:number,rotation:QuarterTurn,
):ShopFloorPoint{
  switch(rotation){
    case 0:return {x,z};
    case 1:return {x:z,z:-x};
    case 2:return {x:-x,z:-z};
    case 3:return {x:-z,z:x};
  }
}

/** Rotated AABB without arrays or per-corner allocation, for hot pathfinding. */
export function shopFixtureBounds(
  kind:ShopFloorKind,p:ShopFloorTransform,
  zone:"footprint"|"solid"="footprint",
):ShopFloorBounds{
  const b=SHOP_FLOOR_FURNITURE[kind][zone];
  switch(p.rotation){
    case 0:return {minX:p.x+b.minX,maxX:p.x+b.maxX,
      minZ:p.z+b.minZ,maxZ:p.z+b.maxZ};
    case 1:return {minX:p.x+b.minZ,maxX:p.x+b.maxZ,
      minZ:p.z-b.maxX,maxZ:p.z-b.minX};
    case 2:return {minX:p.x-b.maxX,maxX:p.x-b.minX,
      minZ:p.z-b.maxZ,maxZ:p.z-b.minZ};
    case 3:return {minX:p.x-b.maxZ,maxX:p.x-b.minZ,
      minZ:p.z+b.minX,maxZ:p.z+b.maxX};
    default:
      // This helper can run during a draft's *pre-validation* before the
      // store rejects a corrupt rotation. Return a finite provisional box
      // instead of throwing in an earlier shelf-overlap check.
      return {minX:p.x+b.minX,maxX:p.x+b.maxX,
        minZ:p.z+b.minZ,maxZ:p.z+b.maxZ};
  }
}

/** True when an actor's horizontal radius overlaps either registered zone. */
export function pointTouchesShopBounds(
  b:ShopFloorBounds,actor:ShopFloorPoint,radius:number,
):boolean{
  return Number.isFinite(actor.x)&&Number.isFinite(actor.z)&&
    Number.isFinite(radius)&&radius>=0&&
    actor.x+radius>b.minX&&actor.x-radius<b.maxX&&
    actor.z+radius>b.minZ&&actor.z-radius<b.maxZ;
}
export function shopFixtureTouches(
  kind:ShopFloorKind,p:ShopFloorTransform,actor:ShopFloorPoint,
  radius:number,zone:"footprint"|"solid"="footprint",
):boolean{
  return pointTouchesShopBounds(shopFixtureBounds(kind,p,zone),actor,radius);
}

export function shelfServicePoint(
  shelf:ShopFloorTransform,slotIndex:number,
):ShopFloorPoint{
  const service=SHOP_FLOOR_FURNITURE.shelf.service;
  if(!Number.isSafeInteger(slotIndex)||slotIndex<0||
     slotIndex>=service.slots)throw new RangeError("Unknown shelf slot");
  const offset=turnShopOffset(service.outward,
    (slotIndex-(service.slots-1)/2)*service.slotSpacing,shelf.rotation);
  return {x:shelf.x+offset.x,z:shelf.z+offset.z};
}

export function cashierServicePoint(
  counter:ShopFloorTransform,who:"staff"|"customer",
):ShopFloorPoint{
  const def=SHOP_FLOOR_FURNITURE.counter;
  const outward=def.footprint.maxZ+
    (who==="staff"?def.service.staffGap:def.service.visitorGap);
  const offset=turnShopOffset(0,who==="staff"?outward:-outward,counter.rotation);
  return {x:counter.x+offset.x,z:counter.z+offset.z};
}




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
