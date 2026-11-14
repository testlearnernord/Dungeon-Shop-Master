/** Bedroom props live outside the NPC shop navigation grid. Their placements
 * are persisted independently of shelves, checkout and dungeon simulation.
 * Existing campaigns without this optional field use the physical defaults.
 */
export type BedroomFurnitureId="desk"|"chest"|"candle";
export interface BedroomFurniturePlacement {
  readonly id:BedroomFurnitureId;
  readonly x:number;
  readonly z:number;
  readonly rotation:0|1|2|3;
}
export type BedroomFurnitureLayout=readonly BedroomFurniturePlacement[];

export const BEDROOM_DEFAULTS:BedroomFurnitureLayout=[
  {id:"desk",x:-2.27,z:-9.08,rotation:0},
  {id:"chest",x:-2.15,z:-11.3,rotation:0},
  {id:"candle",x:2.25,z:-10.95,rotation:0},
] as const;
const sizes:Record<BedroomFurnitureId,{width:number;depth:number}>={
  desk:{width:1.18,depth:0.76},
  chest:{width:1.04,depth:0.72},
  candle:{width:0.66,depth:0.66},
};
export function createBedroomFurnitureLayout():BedroomFurnitureLayout {
  return BEDROOM_DEFAULTS.map(p=>({...p}));
}
export const isBedroomFurnitureId=(id:string):id is BedroomFurnitureId=>
  id==="desk"||id==="chest"||id==="candle";
export function getBedroomFurniture(
  layout:BedroomFurnitureLayout|undefined,id:BedroomFurnitureId,
):BedroomFurniturePlacement {
  return layout?.find(p=>p.id===id)??BEDROOM_DEFAULTS.find(p=>p.id===id)!;
}

interface Bounds {minX:number;maxX:number;minZ:number;maxZ:number}
function bounds(p:BedroomFurniturePlacement):Bounds {
  const size=sizes[p.id];
  const width=p.rotation%2===0?size.width:size.depth;
  const depth=p.rotation%2===0?size.depth:size.width;
  return {minX:p.x-width/2,maxX:p.x+width/2,
    minZ:p.z-depth/2,maxZ:p.z+depth/2};
}
const overlap=(a:Bounds,b:Bounds,pad=0):boolean=>
  a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&
  a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;

export function bedroomFurnitureProblem(layout:BedroomFurnitureLayout):string|null {
  if(!Array.isArray(layout)||layout.length!==3)
    return "The bedroom requires its desk, chest and candle.";
  const seen=new Set<BedroomFurnitureId>();
  const fixedBed:Bounds={minX:-0.06,maxX:1.67,minZ:-11.93,maxZ:-9.22};
  // Galvik must still reach the bed from the bedroom door.
  const doorway:Bounds={minX:-0.72,maxX:0.72,minZ:-8.55,maxZ:-7.4};
  for(const p of layout){
    if(!p||!isBedroomFurnitureId(p.id)||seen.has(p.id))
      return "Bedroom furniture IDs must be unique and complete.";
    seen.add(p.id);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||
       !Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3)
      return "Invalid bedroom furniture coordinates or rotation.";
    // The historical, handcrafted default is a little off the quarter grid.
    const original=BEDROOM_DEFAULTS.find(entry=>entry.id===p.id)!;
    const unchanged=p.x===original.x&&p.z===original.z;
    if(!unchanged&&(Math.abs(p.x*4-Math.round(p.x*4))>1e-8||
      Math.abs(p.z*4-Math.round(p.z*4))>1e-8))
      return "Use 0.25m grid positions for bedroom furniture.";
    const b=bounds(p);
    if(b.minX< -2.77||b.maxX>2.77||b.minZ< -11.85||b.maxZ> -7.65)
      return "The bedroom furniture would intersect a stone wall.";
    if(overlap(b,fixedBed,0.19))
      return "Keep Galvik's bed and sleeping access clear.";
    if(overlap(b,doorway,0.10))
      return "Leave the bedroom doorway clear.";
  }
  for(let i=0;i<layout.length;i++)
    for(let j=i+1;j<layout.length;j++)
      if(overlap(bounds(layout[i]),bounds(layout[j]),0.16))
        return "Bedroom furniture cannot overlap.";
  return null;
}
export function bedroomFurnitureOverlapsActor(
  placement:BedroomFurniturePlacement,
  actor:{readonly x:number;readonly z:number;readonly radius:number},
):boolean {
  if(!Number.isFinite(actor.x)||!Number.isFinite(actor.z)||
     !Number.isFinite(actor.radius)||actor.radius<0)return false;
  const b=bounds(placement);
  return actor.x+actor.radius>b.minX&&actor.x-actor.radius<b.maxX&&
    actor.z+actor.radius>b.minZ&&actor.z-actor.radius<b.maxZ;
}
export function replaceBedroomFurniture(
  layout:BedroomFurnitureLayout|undefined,placement:BedroomFurniturePlacement,
):{layout:BedroomFurnitureLayout;message:string}{
  const current=layout??createBedroomFurnitureLayout();
  if(!placement||!isBedroomFurnitureId(placement.id))
    return {layout:current,message:"Unknown bedroom furniture."};
  const previous=getBedroomFurniture(current,placement.id);
  if(previous.x===placement.x&&previous.z===placement.z&&
     previous.rotation===placement.rotation)
    return {layout:current,message:"Bedroom furniture placed."};
  const next=current.map(p=>p.id===placement.id?{...placement}:p);
  const problem=bedroomFurnitureProblem(next);
  return problem?{layout:current,message:problem}:
    {layout:next,message:"Bedroom furniture placed."};
}
