import type { CounterPlacement, ShelfId, ShelfPlacement } from "./shopLayout.ts";

export type FurnitureId=ShelfId|"counter";
export type BlueprintSurface=
  "floor"|"ceiling"|"left-wall"|"right-wall"|"front-wall"|"back-wall";
export type FurnitureDraft=ShelfPlacement|(CounterPlacement&{readonly id:"counter"});

export interface FurnitureDefinition {
  readonly id:FurnitureId;
  readonly label:string;
  readonly surfaces:readonly BlueprintSurface[];
  /** Current model footprint. Future items register their own mounting rules. */
  readonly width:number;
  readonly depth:number;
  readonly height:number;
}

export const FURNITURE_CATALOG:readonly FurnitureDefinition[]=[
  {id:"shelf-1",label:"Left shelf",surfaces:["floor","left-wall","right-wall","front-wall","back-wall"],width:1.36,depth:6.1,height:2.35},
  {id:"shelf-2",label:"Right shelf",surfaces:["floor","left-wall","right-wall","front-wall","back-wall"],width:1.36,depth:6.1,height:2.35},
  {id:"counter",label:"Checkout counter",surfaces:["floor"],width:2.5,depth:2.3,height:1.8},
] as const;

export const snapQuarter=(value:number):number=>Math.round(value*4)/4;

export function surfaceFromMesh(name:string):BlueprintSurface|null {
  if(name==="stone-floor")return "floor";
  if(name==="stone-ceiling")return "ceiling";
  if(name==="left-wall")return "left-wall";
  if(name==="right-wall")return "right-wall";
  if(name==="front-left-wall"||name==="front-right-wall")return "front-wall";
  if(name==="back-left-wall"||name==="back-middle-wall"||name==="back-right-wall")
    return "back-wall";
  return null;
}

/** Project a cursor hit on room surfaces into a saved furniture transform.
 * Geometry validity and actor occupancy remain authoritative elsewhere.
 * A ceiling-mounting object can be registered later without changing inputs.
 */
export function blueprintAtSurface(
  id:FurnitureId,surface:BlueprintSurface,
  hit:{readonly x:number;readonly z:number},
  rotation:0|1|2|3,
):FurnitureDraft|null {
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  const definition=FURNITURE_CATALOG.find(entry=>entry.id===id);
  if(!definition?.surfaces.includes(surface))return null;
  if(surface==="floor"){
    const x=snapQuarter(hit.x),z=snapQuarter(hit.z);
    return id==="counter"?{id,x,z,rotation}:{id,x,z,rotation};
  }
  if(id==="counter")return null;
  const wallAnchor:{[K in Exclude<BlueprintSurface,"floor"|"ceiling">]:
    {x:number;z:number;rotation:0|1|2|3}}={
    "left-wall":{x:-7,z:snapQuarter(hit.z),rotation:0},
    "right-wall":{x:7,z:snapQuarter(hit.z),rotation:2},
    "front-wall":{x:snapQuarter(hit.x),z:-6.75,rotation:3},
    "back-wall":{x:snapQuarter(hit.x),z:6.75,rotation:1},
  };
  if(surface==="ceiling")return null;
  return {id,...wallAnchor[surface]};
}
