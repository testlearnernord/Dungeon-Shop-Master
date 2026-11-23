/** Canonical geometry, mounting and UI metadata for every movable Level-5 fixture.
 * Babylon meshes, save I/O and simulation state consume this registry; they do
 * not own a second geometry table.
 */
export type ShopFloorKind="shelf"|"counter";
export type QuarterTurn=0|1|2|3;
export type FurnitureSurface=
  "floor"|"ceiling"|"left-wall"|"right-wall"|"front-wall"|"back-wall"|"rock-wall";

export const SHELF_SLOT_COUNT=4;
export const SHELF_SLOT_SPACING=0.72;
export const shelfSlotLocalZ=(index:number):number=>
  (index-(SHELF_SLOT_COUNT-1)/2)*SHELF_SLOT_SPACING;

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

export type FurnitureKind=`shelf-${number}`|"counter"|
  "desk"|"chest"|"candle"|"bed"|"adventurer-board"|"galvik-portrait"|"cellar-chest"|"cellar-table"|"world-clock";
export type FurnitureMount="shop-floor"|"private-floor"|"shop-wall";
export type FurniturePurpose="stock"|"checkout"|"sleep"|"debt"|"storage"|
  "light"|"roster"|"decoration"|"observation";
export type FurniturePoint=ShopFloorPoint;
export type FurnitureBounds=ShopFloorBounds;
export interface FurniturePose {
  readonly id:FurnitureKind;
  readonly x:number;
  readonly z:number;
  readonly rotation:QuarterTurn;
}
export interface FurnitureDefinition {
  readonly label:string;
  readonly mount:FurnitureMount;
  readonly purpose:FurniturePurpose;
  readonly surfaces:readonly FurnitureSurface[];
  readonly width:number;
  readonly depth:number;
  readonly height:number;
  readonly focusY:number;
  readonly collides:boolean;
  readonly focus?:{readonly width:number;readonly height:number;readonly depth:number};
  readonly interaction?:{readonly reach:number;readonly label:string};
  readonly customerService?:"shelf"|"checkout";
  readonly footprint?:ShopFloorBounds;
  readonly solid?:ShopFloorBounds;
  readonly previewOffset?:{readonly x:number;readonly y:number;readonly z:number};
  readonly shelfService?:{readonly outward:number;readonly slots:number;readonly slotSpacing:number};
  readonly checkoutService?:{readonly visitorGap:number;readonly staffGap:number;
    readonly queueSpacing:number;readonly queueCapacity:number};
  readonly body?:{readonly width:number;readonly depth:number};
  readonly register?:ShopFloorPoint;
}

export const FURNITURE_REGISTRY={
  shelf:{
    label:"Shelf",mount:"shop-floor",purpose:"stock",
    surfaces:["floor","left-wall","right-wall","front-wall","back-wall"],
    width:1.2,depth:3.18,height:1.72,focusY:.93,collides:true,
    focus:{width:1.2,depth:3.18,height:1.72},
    customerService:"shelf",
    footprint:{minX:-.13,maxX:1.05,minZ:-1.58,maxZ:1.58},
    solid:{minX:-.13,maxX:1.05,minZ:-1.58,maxZ:1.58},
    previewOffset:{x:.46,y:.93,z:0},
    shelfService:{outward:1.48,slots:SHELF_SLOT_COUNT,slotSpacing:SHELF_SLOT_SPACING},
  },
  counter:{
    label:"Checkout counter",mount:"shop-floor",purpose:"checkout",
    surfaces:["floor"],width:2.15,depth:1.8,height:1.25,focusY:.69,collides:true,
    focus:{width:1.55,depth:.93,height:1.38},
    customerService:"checkout",
    footprint:{minX:-1.075,maxX:1.075,minZ:-.9,maxZ:.9},
    solid:{minX:-.775,maxX:.775,minZ:-.465,maxZ:.465},
    previewOffset:{x:0,y:.64,z:0},
    checkoutService:{visitorGap:.65,staffGap:.58,queueSpacing:1.3,queueCapacity:5},
    body:{width:1.35,depth:.75},register:{x:.28,z:.04},
  },
  desk:{label:"Accounting desk + Book of Debts",mount:"private-floor",purpose:"debt",
    surfaces:["floor"],width:1.18,depth:.76,height:1.25,focusY:.65,collides:true,
    interaction:{reach:1.8,label:"Book of Debts"}},
  chest:{label:"Storage chest",mount:"private-floor",purpose:"storage",
    surfaces:["floor"],width:1.04,depth:.72,height:.9,focusY:.45,collides:true},
  "cellar-chest":{label:"Cellar storage chest",mount:"private-floor",purpose:"storage",
    surfaces:["floor"],width:1.04,depth:.72,height:.9,focusY:.45,collides:true},
  "cellar-table":{label:"Galvik's Table",mount:"private-floor",purpose:"observation",
    surfaces:["floor"],width:2.7,depth:1.75,height:1.4,focusY:.7,collides:true},
  candle:{label:"Bedside candle + stool",mount:"private-floor",purpose:"light",
    surfaces:["floor"],width:.66,depth:.66,height:1.2,focusY:.60,collides:true},
  bed:{label:"Galvik's bed",mount:"private-floor",purpose:"sleep",
    surfaces:["floor"],width:1.74,depth:2.70,height:1.55,focusY:.78,collides:true,
    interaction:{reach:2,label:"Sleep"}},
  "world-clock":{label:"Galvik's World Clock",mount:"shop-wall",purpose:"observation",
    surfaces:["front-wall","left-wall","right-wall","back-wall","rock-wall"],
    width:2.52,depth:.46,height:2.35,focusY:1.91,collides:false},
  "adventurer-board":{label:"Adventurer board",mount:"shop-wall",purpose:"roster",
    surfaces:["front-wall","left-wall","right-wall","rock-wall"],
    width:3.45,depth:.22,height:2.25,focusY:2.17,collides:false,
    interaction:{reach:2.2,label:"Adventurers"}},
  "galvik-portrait":{label:"Portrait of Galvik's lost beloved",
    mount:"shop-wall",purpose:"decoration",
    surfaces:["front-wall","left-wall","right-wall","back-wall","rock-wall"],
    width:1.08,depth:.14,height:1.3,focusY:2.15,collides:false},
} as const;

const registeredShelf=(id:string):boolean=>
  /^shelf-[1-9][0-9]*$/.test(id)&&Number(id.slice(6))<=12;
const staticFurniture=(id:string):id is Exclude<FurnitureKind,`shelf-${number}`>=>
  id!=="shelf"&&Object.hasOwn(FURNITURE_REGISTRY,id);

export const furnitureDefinition=(id:FurnitureKind):FurnitureDefinition=>
  (registeredShelf(id)?FURNITURE_REGISTRY.shelf:
    FURNITURE_REGISTRY[id as keyof typeof FURNITURE_REGISTRY]) as FurnitureDefinition;
export const shopFurnitureDefinition=<K extends ShopFloorKind>(kind:K)=>
  FURNITURE_REGISTRY[kind];

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

export function shopFixtureBounds(
  kind:ShopFloorKind,p:ShopFloorTransform,
  zone:"footprint"|"solid"="footprint",
):ShopFloorBounds{
  const definition=shopFurnitureDefinition(kind);
  const b=definition[zone];
  switch(p.rotation){
    case 0:return {minX:p.x+b.minX,maxX:p.x+b.maxX,minZ:p.z+b.minZ,maxZ:p.z+b.maxZ};
    case 1:return {minX:p.x+b.minZ,maxX:p.x+b.maxZ,minZ:p.z-b.maxX,maxZ:p.z-b.minX};
    case 2:return {minX:p.x-b.maxX,maxX:p.x-b.minX,minZ:p.z-b.maxZ,maxZ:p.z-b.minZ};
    case 3:return {minX:p.x-b.maxZ,maxX:p.x-b.minZ,minZ:p.z+b.minX,maxZ:p.z+b.maxX};
    default:return {minX:p.x+b.minX,maxX:p.x+b.maxX,minZ:p.z+b.minZ,maxZ:p.z+b.maxZ};
  }
}

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
  const service=FURNITURE_REGISTRY.shelf.shelfService;
  if(!Number.isSafeInteger(slotIndex)||slotIndex<0||slotIndex>=service.slots)
    throw new RangeError("Unknown shelf slot");
  const offset=turnShopOffset(service.outward,shelfSlotLocalZ(slotIndex),shelf.rotation);
  return {x:shelf.x+offset.x,z:shelf.z+offset.z};
}

export function cashierServicePoint(
  counter:ShopFloorTransform,who:"staff"|"customer",
):ShopFloorPoint{
  const def=FURNITURE_REGISTRY.counter;
  const outward=def.footprint.maxZ+
    (who==="staff"?def.checkoutService.staffGap:def.checkoutService.visitorGap);
  const offset=turnShopOffset(0,who==="staff"?outward:-outward,counter.rotation);
  return {x:counter.x+offset.x,z:counter.z+offset.z};
}

export function furnitureBounds(p:FurniturePose):FurnitureBounds {
  if(registeredShelf(p.id))return shopFixtureBounds("shelf",p);
  if(p.id==="counter")return shopFixtureBounds("counter",p);
  const def=furnitureDefinition(p.id);
  const turn=p.rotation%2===1;
  const w=turn?def.depth:def.width,d=turn?def.width:def.depth;
  return {minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2};
}
export function furnitureSolidBounds(p:FurniturePose):FurnitureBounds {
  if(registeredShelf(p.id))return shopFixtureBounds("shelf",p,"solid");
  if(p.id==="counter")return shopFixtureBounds("counter",p,"solid");
  return furnitureBounds(p);
}
export function furnitureTouchesActor(
  p:FurniturePose,actor:{readonly x:number;readonly z:number;readonly radius:number},
):boolean {
  if(!furnitureDefinition(p.id).collides)return false;
  if(registeredShelf(p.id))return shopFixtureTouches("shelf",p,actor,actor.radius);
  if(p.id==="counter")return shopFixtureTouches("counter",p,actor,actor.radius);
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
  typeof id==="string"&&(registeredShelf(id)||staticFurniture(id));
