import { isLevel5Air, type Level5Room } from "./level5Room.ts";
import {SHOP_PORTAL_BUILD_CLEARANCE,SEALED_PASSAGE_BUILD_CLEARANCE,
  overlapsShopPortalClearance} from "./shopPortal.ts";
import {
  cashierServicePoint,shelfServicePoint,
  shopFixtureBounds,shopFixtureTouches,
  type ShopFloorKind,type ShopFloorBounds,
} from "./furnitureRegistry.ts";
/** Persisted shop furniture transforms. No rendering, economy or RNG dependencies. */
/** Stable per-instance furniture IDs, generated only when a shelf is built. */
export type ShelfId = `shelf-${number}`;
/** Bounded by room area and current service/mesh workload, not two fixed shelves. */
export const MAX_SHOP_SHELVES=12;
export const isShelfId=(value:unknown):value is ShelfId=>
  typeof value==="string"&&/^shelf-[1-9][0-9]*$/.test(value)&&
  Number(value.slice(6))<=MAX_SHOP_SHELVES;
export const nextShelfId=(layout:ShopLayout):ShelfId|null=>
  layout.shelves.length<MAX_SHOP_SHELVES
    ?`shelf-${layout.shelves.length+1}` as ShelfId:null;
export interface ShelfPlacement {
  readonly id: ShelfId;
  /** Metres, snapped to 0.25m grid. */
  readonly x: number;
  readonly z: number;
  /** Quarter turns around Y. 0 faces +X and 2 faces -X. */
  readonly rotation: 0 | 1 | 2 | 3;
}
export interface ShopLayout {
  readonly shelves: readonly ShelfPlacement[];
  readonly counter: CounterPlacement;
}
/** Persisted checkout transform. Geometry lives in furnitureRegistry.ts. */
export interface CounterPlacement {
  readonly x: number;
  readonly z: number;
  readonly rotation: 0 | 1 | 2 | 3;
}
export function compactCounterBounds(placement: CounterPlacement):ShopFloorBounds {
  return shopFixtureBounds("counter",placement);
}

/** New campaigns start at the back-left corner near Galvik's private door. */
export const NEW_GAME_COUNTER_PLACEMENT:CounterPlacement=
  Object.freeze({x:-4.25,z:-4.5,rotation:3});
export const getCounterPlacement=(layout:ShopLayout):CounterPlacement=>layout.counter;
export const movableCounterBounds=(layout:ShopLayout)=>compactCounterBounds(getCounterPlacement(layout));
/** Shared physical service sockets, in the exact rotated frame of the till. */
export function counterDockPoint(layout:ShopLayout,who:"staff"|"customer"):{
  x:number;z:number
}{
  return cashierServicePoint(getCounterPlacement(layout),who);
}
export function isAtCounterStaffDock(
  layout:ShopLayout,person:{readonly x:number;readonly z:number},radius=1.05,
):boolean{
  const dock=counterDockPoint(layout,"staff");
  return Number.isFinite(person.x)&&Number.isFinite(person.z)&&
    Math.hypot(person.x-dock.x,person.z-dock.z)<=radius;
}


type Bounds=ShopFloorBounds;
export interface RegisteredShopFixture {
  readonly id:string;
  readonly kind:ShopFloorKind;
  readonly footprint:ShopFloorBounds;
  readonly solid:ShopFloorBounds;
}
/** Materialize collision geometry once per immutable layout rather than
 * recalculating rotated shelf corners in every half-metre pathfinding cell.
 * New shop-floor layout categories must be wired here and in the registry. */
const fixtureCache=new WeakMap<ShopLayout,readonly RegisteredShopFixture[]>();
export function shopFloorFixtures(layout:ShopLayout):readonly RegisteredShopFixture[]{
  const hit=fixtureCache.get(layout);
  if(hit)return hit;
  const fixtures:RegisteredShopFixture[]=layout.shelves.map(shelf=>({
    id:shelf.id,kind:"shelf",
    footprint:shopFixtureBounds("shelf",shelf),
    solid:shopFixtureBounds("shelf",shelf,"solid"),
  }));
  const counter=getCounterPlacement(layout);
  fixtures.push({
    id:"counter",kind:"counter",
    footprint:shopFixtureBounds("counter",counter),
    solid:shopFixtureBounds("counter",counter,"solid"),
  });
  fixtureCache.set(layout,fixtures);
  return fixtures;
}
const barriers: readonly Bounds[] = [
  {minX:-1.35,maxX:1.35,minZ:-5.6,maxZ:-3.55}, // player spawn
  {minX:-2.5,maxX:2.5,minZ:-6.9,maxZ:-5.3}, // roster board viewing
  // No hard-coded full-length side aisles. Furniture navigation and
  // shelf checkout reachability are tested against actual room geometry
  // after placement, including excavated floor, instead of excluding two
  // large rectangles even when a perfectly safe alternate route exists.
  SHOP_PORTAL_BUILD_CLEARANCE, // actual cursed threshold / NPC clearance
  SEALED_PASSAGE_BUILD_CLEARANCE, // permanent rock over the old right opening
  {minX:-1.8,maxX:1.8,minZ:3.1,maxZ:7.0}, // queue and central walking route
];
const overlap=(a:Bounds,b:Bounds,padding=0)=>
  a.minX < b.maxX+padding && a.maxX > b.minX-padding &&
  a.minZ < b.maxZ+padding && a.maxZ > b.minZ-padding;
const quarter=(n:number)=>Number.isFinite(n)&&Math.abs(n*4-Math.round(n*4))<1e-8;
const canonical=isShelfId;

export function createShopLayout(): ShopLayout {
  return {shelves:[],counter:{...NEW_GAME_COUNTER_PLACEMENT}};
}
export function shelfBounds(p:ShelfPlacement):Bounds {
  return shopFixtureBounds("shelf",p);
}
/** A fresh 1m excavation isn't necessarily big enough for a real shelf
 * or cash desk. Tell the player what is missing instead of implying that P
 * ignored the new floor. The same result is used by preview and commit. */
function outsideOriginalSide(box:Bounds):boolean{
  return box.minX< -7.5||box.maxX>7.5;
}
function unsupportedFootprintMessage(box:Bounds,room:Level5Room|undefined,
  furniture:"shelf"|"counter"):string{
  return room&&room.expansionTier>0&&outsideOriginalSide(box)
    ?"Excavate connected floor beneath the entire "+furniture+
      " and leave space for visitors; one rock cell is only 1 metre wide."
    :"The "+furniture+" would intersect a shop wall.";
}
/** Descriptive validation is shared by editor, GameStore and strict save loading. */
/** Every quarter-metre of a furniture footprint must rest on excavated floor. */
function onRoomFloor(box:Bounds,room:Level5Room):boolean {
  for(let x=box.minX+.05;x<box.maxX;x+=.25){
    for(let z=box.minZ+.05;z<box.maxZ;z+=.25){
      if(!isLevel5Air(room,{x:Math.floor(x+.5),z:Math.floor(z+.5)}))return false;
    }
  }
  for(const x of [box.minX+.02,box.maxX-.02])
    for(const z of [box.minZ+.02,box.maxZ-.02])
      if(!isLevel5Air(room,{x:Math.floor(x+.5),z:Math.floor(z+.5)}))return false;
  return true;
}
export function shopLayoutProblem(layout:ShopLayout,room?:Level5Room): string|null {
  if(!layout||!Array.isArray(layout.shelves))
    return "A valid furniture instance list is required.";
  if(layout.shelves.length>MAX_SHOP_SHELVES)
    return "The shop has reached its current shelf capacity.";
  const seen=new Set<string>();
  for(const [index,p] of layout.shelves.entries()){
    // Stable, monotonic IDs also make imported saves and held carts safe:
    // A removed instance ID must never be silently reassigned to other stock.
    if(!p||!canonical(p.id)||p.id!==`shelf-${index+1}`||
       seen.has(p.id))
      return "Shelf IDs must be ordered, unique and contiguous.";
    seen.add(p.id);
    if(!quarter(p.x)||!quarter(p.z)||!Number.isInteger(p.rotation)||
      p.rotation<0||p.rotation>3)
      return "Use 0.25m steps and quarter-turn rotations.";
    const box=shelfBounds(p);
    if(room ? !onRoomFloor(box,room) :
      box.minX < -7.3||box.maxX>7.3||box.minZ< -6.8||box.maxZ>6.8)
      return unsupportedFootprintMessage(box,room,"shelf");
    if(overlap(box,movableCounterBounds(layout),0.04)||
      overlapsShopPortalClearance(box,0.04)||barriers.some(zone=>overlap(box,zone,0.04)))
      return "Keep the counter, entrances and visitor aisles clear.";
  }
  for(let i=0;i<layout.shelves.length;i++)
    for(let j=i+1;j<layout.shelves.length;j++)
      if(overlap(shelfBounds(layout.shelves[i]),shelfBounds(layout.shelves[j]),.28))
        return "Shelves cannot overlap.";
  {
    const p=layout.counter;
    if(!p||!quarter(p.x)||!quarter(p.z)||!Number.isInteger(p.rotation)||
      p.rotation<0||p.rotation>3)return "Use 0.25m steps and quarter-turn rotations.";
    const box=compactCounterBounds(p);
    if(room ? !onRoomFloor(box,room) :
      box.minX < -7.3||box.maxX>7.3||box.minZ< -6.8||box.maxZ>6.8)
      return unsupportedFootprintMessage(box,room,"counter");
    // Keep the actual gate approach clear regardless of counter rotation.
    const gateApproach={minX:-1.8,maxX:1.8,minZ:4,maxZ:7};
    if(overlapsShopPortalClearance(box,0.04)||
      barriers.slice(0,-1).some(zone=>overlap(box,zone,0.04))||
      overlap(box,gateApproach,0.04)||
      layout.shelves.some(shelf=>overlap(box,shelfBounds(shelf),0.04)))
      return "Keep the counter, entrances and visitor aisles clear.";
    // Even future hired workers need physical standing space behind the
    // desk. Do not allow a cashier that visitors can reach but staff cannot.
    const staff=counterDockPoint(layout,"staff");
    const staffBox={minX:staff.x-.36,maxX:staff.x+.36,
      minZ:staff.z-.36,maxZ:staff.z+.36};
    if((room?!onRoomFloor(staffBox,room):
      staffBox.minX< -7.1||staffBox.maxX>7.1||
      staffBox.minZ< -6.65||staffBox.maxZ>6.65)||
      layout.shelves.some(shelf=>overlap(staffBox,shelfBounds(shelf),.04))||
      barriers.some(zone=>overlap(staffBox,zone,.04)))
      return "Leave an accessible staff position behind the counter.";
    // Reserve a reachable first customer spot *in front* of the counter.
    // Counter placement must not push the entire checkout queue beyond walls
    // or into fixed player/door/roster obstacles.
    const front=cashierServicePoint(p,"customer");
    const standing={minX:front.x-0.35,maxX:front.x+0.35,
      minZ:front.z-0.35,maxZ:front.z+0.35};
    if((room ? !onRoomFloor(standing,room) :
       standing.minX < -6.5||standing.maxX > 6.5||
       standing.minZ < -6.5||standing.maxZ > 6.5)||
       barriers.some(zone=>overlap(standing,zone))||
       layout.shelves.some(shelf=>overlap(standing,shelfBounds(shelf))))
      return "Leave a reachable checkout queue in front of the counter.";
  }
  return null;
}
/** True if a living actor's horizontal capsule overlaps this furniture. */
export function shelfOverlapsActor(
  placement:ShelfPlacement,actor: {readonly x:number;readonly z:number;readonly radius:number},
):boolean {
  return shopFixtureTouches("shelf",placement,actor,actor.radius);
}

export function replaceShelfPlacement(
  layout:ShopLayout,placement:ShelfPlacement,room?:Level5Room,
): {layout:ShopLayout;message:string} {
  if(!canonical(placement.id))
    return {layout,message:"Unknown shelf."};
  const previous=layout.shelves.find(p=>p.id===placement.id);
  if(!previous&&placement.id!==nextShelfId(layout))
    return {layout,message:"Only the next unused shelf can be built."};
  if(previous&&previous.x===placement.x&&previous.z===placement.z&&
    previous.rotation===placement.rotation)
    return {layout,message:"Shelf placement saved."};
  const next:ShopLayout={...layout,shelves:previous
    ?layout.shelves.map(p=>p.id===placement.id?placement:p)
    :[...layout.shelves,placement]};
  const problem=shopLayoutProblem(next,room);
  return problem?{layout,message:problem}:{layout:next,message:"Shelf placement saved."};
}

/** Counter placement shares the shelf editor's immutable commit/validation flow. */
export function replaceCounterPlacement(layout:ShopLayout,placement:CounterPlacement,room?:Level5Room):
  {layout:ShopLayout;message:string} {
  const old=getCounterPlacement(layout);
  if(old.x===placement.x&&old.z===placement.z&&old.rotation===placement.rotation)
    return {layout,message:"Counter placement saved."};
  // Editor drafts carry an id: "counter"; never persist that UI-only field.
  const counter:CounterPlacement={x:placement.x,z:placement.z,rotation:placement.rotation};
  const next:ShopLayout={...layout,counter};
  const problem=shopLayoutProblem(next,room);
  return problem?{layout,message:problem}:{layout:next,message:"Counter placement saved."};
}

export function counterOverlapsActor(
  placement:CounterPlacement,actor:{readonly x:number;readonly z:number;readonly radius:number},
):boolean {
  return shopFixtureTouches("counter",placement,actor,actor.radius);
}
