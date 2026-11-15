import type { CounterPlacement, ShelfId, ShelfPlacement } from "./shopLayout.ts";
import {furnitureDefinition} from "./furnitureRegistry.ts";
import {isShelfId} from "./shopLayout.ts";
import type {BedroomFurnitureId,BedroomFurniturePlacement} from "./bedroomFurniture.ts";
import {isBedroomFurnitureId} from "./bedroomFurniture.ts";
import {rosterBoardAtWall,type RosterBoardPlacement} from "./rosterBoardPlacement.ts";

export type FurnitureId=ShelfId|"counter"|BedroomFurnitureId|"adventurer-board";
export type BlueprintSurface=
  "floor"|"ceiling"|"left-wall"|"right-wall"|"front-wall"|"back-wall"|"rock-wall";
export type FurnitureDraft=ShelfPlacement|(CounterPlacement&{readonly id:"counter"})|BedroomFurniturePlacement|
  (RosterBoardPlacement&{readonly id:"adventurer-board"});

export interface FurnitureDefinition {
  readonly id:FurnitureId;
  readonly label:string;
  readonly surfaces:readonly BlueprintSurface[];
  /** Current model footprint. Future items register their own mounting rules. */
  readonly width:number;
  readonly depth:number;
  readonly height:number;
}

/** All visible sizes come from the same registry used by collision
 * and authoritative placement. Keep IDs and mounting faces explicit here.
 */
const def=(id:FurnitureId)=>furnitureDefinition(id);
const catalogEntry=(id:FurnitureId,label:string,
  surfaces:readonly BlueprintSurface[]):FurnitureDefinition=>({
    id,label,surfaces,width:def(id).width,depth:def(id).depth,
    height:def(id).height,
  });
export const FURNITURE_CATALOG:readonly FurnitureDefinition[]=[
  catalogEntry("shelf-1","Left shelf",
    ["floor","left-wall","right-wall","front-wall","back-wall"]),
  catalogEntry("shelf-2","Right shelf",
    ["floor","left-wall","right-wall","front-wall","back-wall"]),
  catalogEntry("counter","Checkout counter",["floor"]),
  catalogEntry("desk","Accounting desk + Book of Debts",["floor"]),
  catalogEntry("chest","Storage chest",["floor"]),
  catalogEntry("candle","Bedside candle + stool",["floor"]),
  catalogEntry("bed","Galvik's bed",["floor"]),
  catalogEntry("adventurer-board","Adventurer board",
    ["front-wall","left-wall","right-wall","rock-wall"]),
] as const;

export const snapQuarter=(value:number):number=>Math.round(value*4)/4;

export function surfaceFromMesh(name:string):BlueprintSurface|null {
  if(name==="stone-floor"||name==="bedroom-floor-skin"||
     /^excavated-floor--?\d+,-?\d+$/.test(name))return "floor";
  if(name==="stone-ceiling")return "ceiling";
  // Only actual topology-generated stone faces are valid mounting hits.
  // A similarly prefixed decorative or stale mesh must not become a wall.
  if(/^excavation-rock-face--?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?:\d+(?:\.\d+)?:\d+(?:\.\d+)?:(?:-?\d+)?:(?:-?\d+)?:(?:true|false)$/.test(name))
    return "rock-wall";
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
  room?:import("./level5Room.ts").Level5Room,
):FurnitureDraft|null {
  if(!Number.isFinite(hit.x)||!Number.isFinite(hit.z))return null;
  const definition=FURNITURE_CATALOG.find(entry=>entry.id===id);
  const permitted=definition?.surfaces??(isShelfId(id)?
    ["floor","left-wall","right-wall","front-wall","back-wall"]:[]);
  if(!permitted.includes(surface))return null;
  if(id==="adventurer-board"){
    const wall=rosterBoardAtWall(surface,hit,room);
    return wall?{id,...wall}:null;
  }
  if(surface==="floor"){
    const x=snapQuarter(hit.x),z=snapQuarter(hit.z);
    return id==="counter"?{id,x,z,rotation}:{id,x,z,rotation};
  }
  if(id==="counter"||isBedroomFurnitureId(id))return null;
  const wallAnchor:{[K in Exclude<BlueprintSurface,"floor"|"ceiling"|"rock-wall">]:
    {x:number;z:number;rotation:0|1|2|3}}={
    "left-wall":{x:-7,z:snapQuarter(hit.z),rotation:0},
    "right-wall":{x:7,z:snapQuarter(hit.z),rotation:2},
    "front-wall":{x:snapQuarter(hit.x),z:-6.75,rotation:3},
    "back-wall":{x:snapQuarter(hit.x),z:6.75,rotation:1},
  };
  if(surface==="ceiling"||surface==="rock-wall")return null;
  return {id,...wallAnchor[surface]};
}
