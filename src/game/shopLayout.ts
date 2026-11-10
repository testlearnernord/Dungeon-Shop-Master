/** Persisted shop furniture transforms. No rendering, economy or RNG dependencies. */
export type ShelfId = "shelf-1" | "shelf-2";
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
}
/** One source of truth for the checkout furniture and its clearance zone.
 * The clearance deliberately preserves legacy NPC paths and saved layouts.
 * Future movable counters must validate this footprint before changing position.
 */
export const CHECKOUT_COUNTER = Object.freeze({
  x:0,z:2.45,
  bodyWidth:3.5,bodyDepth:1.15,
  topWidth:3.75,topDepth:1.35,
  registerOffsetX:0.9,registerOffsetZ:-0.1,
  clearanceHalfWidth:2.25,
  clearanceMinZ:1.15,clearanceMaxZ:3.45,
});
export function checkoutCounterBounds() {
  const c=CHECKOUT_COUNTER;
  return {minX:c.x-c.clearanceHalfWidth,maxX:c.x+c.clearanceHalfWidth,
    minZ:c.clearanceMinZ,maxZ:c.clearanceMaxZ};
}

const IDS: readonly ShelfId[] = ["shelf-1","shelf-2"];
type Bounds={minX:number;maxX:number;minZ:number;maxZ:number};
const barriers: readonly Bounds[] = [
  checkoutCounterBounds(), // checkout counter
  {minX:-1.35,maxX:1.35,minZ:-5.6,maxZ:-3.55}, // player spawn
  {minX:-2.5,maxX:2.5,minZ:-6.9,maxZ:-5.3}, // roster board viewing
  {minX:-5.7,maxX:-4.0,minZ:-3.15,maxZ:3.15}, // left browsing aisle
  {minX:4.0,maxX:5.7,minZ:-3.15,maxZ:3.15}, // right browsing aisle
  {minX:-5.6,maxX:-2.4,minZ:3.15,maxZ:7.0}, // Level 4 corridor
  {minX:2.4,maxX:5.6,minZ:3.15,maxZ:7.0}, // Level 6 corridor
  {minX:-1.8,maxX:1.8,minZ:3.1,maxZ:7.0}, // queue and central walking route
];
const overlap=(a:Bounds,b:Bounds,padding=0)=>
  a.minX < b.maxX+padding && a.maxX > b.minX-padding &&
  a.minZ < b.maxZ+padding && a.maxZ > b.minZ-padding;
const quarter=(n:number)=>Number.isFinite(n)&&Math.abs(n*4-Math.round(n*4))<1e-8;
const canonical=(id:unknown):id is ShelfId=>id==="shelf-1"||id==="shelf-2";

export function createShopLayout(): ShopLayout {
  return {shelves:[
    {id:"shelf-1",x:-7,z:0,rotation:0},
    {id:"shelf-2",x:7,z:0,rotation:2},
  ]};
}
export function rotateShelfOffset(
  x:number,z:number,turns:0|1|2|3,
): {x:number;z:number} {
  switch(turns) {
    case 0: return {x,z};
    case 1: return {x:z,z:-x};
    case 2: return {x:-x,z:-z};
    case 3: return {x:-z,z:x};
  }
}
export function shelfBounds(p:ShelfPlacement):Bounds {
  // Includes plank, back and stocked objects, but not a character's reach.
  const corners = [[-0.16,-3.02],[-0.16,3.02],[1.16,-3.02],[1.16,3.02]]
    .map(([x,z])=>rotateShelfOffset(x,z,p.rotation));
  return {
    minX:p.x+Math.min(...corners.map(c=>c.x)),
    maxX:p.x+Math.max(...corners.map(c=>c.x)),
    minZ:p.z+Math.min(...corners.map(c=>c.z)),
    maxZ:p.z+Math.max(...corners.map(c=>c.z)),
  };
}
/** Descriptive validation is shared by editor, GameStore and strict save loading. */
export function shopLayoutProblem(layout:ShopLayout): string|null {
  if(!layout || !Array.isArray(layout.shelves)||layout.shelves.length!==2)
    return "Exactly two shelves are required.";
  const seen=new Set<string>();
  for(const p of layout.shelves){
    if(!p||!canonical(p.id)||seen.has(p.id))
      return "Shelf IDs must be shelf-1 and shelf-2 without duplicates.";
    seen.add(p.id);
    if(!quarter(p.x)||!quarter(p.z)||!Number.isInteger(p.rotation)||
      p.rotation<0||p.rotation>3)
      return "Use 0.25m steps and quarter-turn rotations.";
    const box=shelfBounds(p);
    if(box.minX < -7.3||box.maxX>7.3||box.minZ< -6.8||box.maxZ>6.8)
      return "The shelf would intersect a shop wall.";
    if(barriers.some(zone=>overlap(box,zone,0.04)))
      return "Keep the counter, entrances and visitor aisles clear.";
  }
  if(overlap(shelfBounds(layout.shelves[0]),shelfBounds(layout.shelves[1]),0.28))
    return "Shelves cannot overlap.";
  return null;
}
/** True if a living actor's horizontal capsule overlaps this furniture. */
export function shelfOverlapsActor(
  placement:ShelfPlacement,actor: {readonly x:number;readonly z:number;readonly radius:number},
):boolean {
  const bounds=shelfBounds(placement);
  return Number.isFinite(actor.x)&&Number.isFinite(actor.z)&&
    Number.isFinite(actor.radius)&&actor.radius>=0&&
    actor.x+actor.radius>bounds.minX&&actor.x-actor.radius<bounds.maxX&&
    actor.z+actor.radius>bounds.minZ&&actor.z-actor.radius<bounds.maxZ;
}

export function replaceShelfPlacement(
  layout:ShopLayout,placement:ShelfPlacement,
): {layout:ShopLayout;message:string} {
  if(!canonical(placement.id))
    return {layout,message:"Unknown shelf."};
  const previous=layout.shelves.find(p=>p.id===placement.id);
  if(previous&&previous.x===placement.x&&previous.z===placement.z&&
    previous.rotation===placement.rotation)
    return {layout,message:"Shelf placement saved."};
  const next:ShopLayout={shelves:layout.shelves.map(p=>p.id===placement.id?placement:p)};
  const problem=shopLayoutProblem(next);
  return problem?{layout,message:problem}:{layout:next,message:"Shelf placement saved."};
}
