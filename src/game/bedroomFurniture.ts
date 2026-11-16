import {furnitureBounds,furnitureBoundsOverlap,furnitureTouchesActor} from "./furnitureRegistry.ts";
/** Galvik's private-room furniture uses the shared furniture geometry while
 * retaining room-specific doorway and bed-access rules. */
export type BedroomFurnitureId="desk"|"chest"|"candle"|"bed";
export interface BedroomFurniturePlacement{
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
  {id:"bed",x:0.8,z:-10.6,rotation:0},
] as const;

export function createBedroomFurnitureLayout():BedroomFurnitureLayout{
  return BEDROOM_DEFAULTS.map(p=>({...p}));
}
export const isBedroomFurnitureId=(id:string):id is BedroomFurnitureId=>
  id==="desk"||id==="chest"||id==="candle"||id==="bed";
export function getBedroomFurniture(
  layout:BedroomFurnitureLayout,id:BedroomFurnitureId,
):BedroomFurniturePlacement{
  return layout.find(p=>p.id===id)!;
}

type Bounds=ReturnType<typeof furnitureBounds>;
const bounds=(p:BedroomFurniturePlacement):Bounds=>furnitureBounds(p);
const overlap=furnitureBoundsOverlap;
const quarter=(n:number)=>Math.abs(n*4-Math.round(n*4))<1e-8;

/** Keep an accessible place beside the mattress, not just a legal bed
 * bounding box. This is deliberately local to Galvik's room; dungeon
 * customer navigation does not enter the private bedroom.
 */
function hasBedAccess(layout:BedroomFurnitureLayout):boolean{
  const bed=getBedroomFurniture(layout,"bed");
  const candidates=bed.rotation%2===0
    ?[{x:bed.x,z:bed.z+1.83},{x:bed.x,z:bed.z-1.83},
      {x:bed.x+1.38,z:bed.z},{x:bed.x-1.38,z:bed.z}]
    :[{x:bed.x+1.83,z:bed.z},{x:bed.x-1.83,z:bed.z},
      {x:bed.x,z:bed.z+1.38},{x:bed.x,z:bed.z-1.38}];
  return candidates.some(point=>
    point.x>=-2.65&&point.x<=2.65&&point.z>=-11.8&&point.z<=-7.85&&
    !layout.filter(p=>p.id!=="bed").some(p=>{
      const b=bounds(p);
      return point.x>b.minX-0.36&&point.x<b.maxX+0.36&&
        point.z>b.minZ-0.36&&point.z<b.maxZ+0.36;
    }));
}
export function bedroomFurnitureProblem(layout:BedroomFurnitureLayout):string|null{
  if(!Array.isArray(layout)||layout.length!==4)
    return "The bedroom needs its desk, chest, candle and bed.";
  const seen=new Set<BedroomFurnitureId>();
  const doorway:Bounds={minX:-0.72,maxX:0.72,minZ:-8.55,maxZ:-7.4};
  for(const p of layout){
    if(!p||!isBedroomFurnitureId(p.id)||seen.has(p.id))
      return "Bedroom furniture IDs must be unique and complete.";
    seen.add(p.id);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||
       !Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3)
      return "Invalid bedroom furniture coordinates or rotation.";
    const original=BEDROOM_DEFAULTS.find(entry=>entry.id===p.id)!;
    const unchanged=p.x===original.x&&p.z===original.z;
    if(!unchanged&&(!quarter(p.x)||!quarter(p.z)))
      return "Use 0.25m grid positions for bedroom furniture.";
    const b=bounds(p);
    // The handcrafted mattress extends 0.1m further toward the rear rock.
    const minZ=p.id==="bed"?-12.0:-11.85;
    if(b.minX< -2.95||b.maxX>2.77||b.minZ<minZ||b.maxZ> -7.65)
      return "The bedroom furniture would intersect a stone wall.";
    if(overlap(b,doorway,0.10))
      return "Leave the bedroom doorway clear.";
  }
  for(const id of ["desk","chest","candle","bed"] as const)
    if(!seen.has(id))return "Missing required bedroom furniture.";
  for(let i=0;i<layout.length;i++)
    for(let j=i+1;j<layout.length;j++)
      if(overlap(bounds(layout[i]),bounds(layout[j]),0.16))
        return "Bedroom furniture cannot overlap or obstruct Galvik's bed.";
  if(!hasBedAccess(layout))
    return "Leave accessible standing space beside Galvik's bed.";
  return null;
}
export function bedroomFurnitureOverlapsActor(
  placement:BedroomFurniturePlacement,
  actor:{readonly x:number;readonly z:number;readonly radius:number},
):boolean{
  if(!Number.isFinite(actor.x)||!Number.isFinite(actor.z)||
     !Number.isFinite(actor.radius)||actor.radius<0)return false;
  return furnitureTouchesActor(placement,actor);
}
export function replaceBedroomFurniture(
  layout:BedroomFurnitureLayout,placement:BedroomFurniturePlacement,
):{layout:BedroomFurnitureLayout;message:string}{
  const current=layout;
  if(!placement||!isBedroomFurnitureId(placement.id))
    return {layout:current,message:"Unknown bedroom furniture."};
  const previous=getBedroomFurniture(current,placement.id);
  if(previous.x===placement.x&&previous.z===placement.z&&
     previous.rotation===placement.rotation)
    return {layout:current,message:"Bedroom furniture placed."};
  const next=current.some(p=>p.id===placement.id)
    ?current.map(p=>p.id===placement.id?{...placement}:p)
    :[...current,{...placement}];
  const problem=bedroomFurnitureProblem(next);
  return problem?{layout:current,message:problem}:
    {layout:next,message:"Bedroom furniture placed."};
}
