import type { FurnitureId } from "./furnitureBlueprint.ts";
import {FURNITURE_REGISTRY,type FurnitureKind} from "./furnitureRegistry.ts";

/** All visible built-in furnishings have a stable identity, not a keyboard slot.
 * Persisted positions are resolved from GameState when focused; this module
 * only maps visible mesh identities to movable objects and focus dimensions.
 */
export interface LookedAtFurniture {
  readonly id:string;
  readonly label:string;
  readonly movableId:FurnitureId;
  readonly bounds:{width:number;height:number;depth:number};
  readonly focusY:number;
}

const bounds=(id:FurnitureKind)=>{
  const definition=FURNITURE_REGISTRY[id] as
    import("./furnitureRegistry.ts").FurnitureDefinition;
  if(definition.focus)return definition.focus;
  const {width,height,depth}=definition;
  return {width,height,depth};
};

const furniture:readonly LookedAtFurniture[]=[
  {id:"shelf-1",label:"Left shelf",movableId:"shelf-1",
    bounds:bounds("shelf-1"),focusY:1.27},
  {id:"shelf-2",label:"Right shelf",movableId:"shelf-2",
    bounds:bounds("shelf-2"),focusY:1.27},
  {id:"counter",label:"Checkout counter",movableId:"counter",
    bounds:bounds("counter"),focusY:0.69},
  {id:"adventurer-board",label:"Adventurer board",movableId:"adventurer-board",bounds:bounds("adventurer-board"),focusY:2.17},
  {id:"bed",label:"Galvik's bed",movableId:"bed",bounds:bounds("bed"),focusY:0.78},
  {id:"debt-book",label:"Book of Debts · move with desk",movableId:"desk",bounds:bounds("desk"),focusY:0.65},
  {id:"desk",label:"Accounting desk",movableId:"desk",bounds:bounds("desk"),focusY:0.65},
  {id:"chest",label:"Storage chest",movableId:"chest",bounds:bounds("chest"),focusY:0.45},
  {id:"candle",label:"Bedside candle + stool",movableId:"candle",bounds:bounds("candle"),focusY:0.60},
];

/** Mesh names, including their component pieces, resolve to one furniture.
 * Avoid selecting rock, NPCs, product labels, or stock items as furniture.
 */
export function classifyFurnitureMesh(name:string):LookedAtFurniture|null {
  if(/^shelf-[12]-(slot-|back|plank|root|placement-preview)/.test(name))
    return furniture[Number(name[6])-1]??null;
  if(["checkout-counter","counter-top","register-base","cash-register"].includes(name))
    return furniture[2];
  if(name==="adventurer-roster-board"||name.startsWith("roster-frame-"))
    return furniture[3];
  if(name==="galvik-bed"||/^bed-(frame|post|headboard|footboard|blanket|quilt|pillow)/.test(name))
    return furniture[4];
  if(/^bedroom-account-(book|pages|spine)$/.test(name))return furniture[5];
  if(name==="bedroom-desk"||name.startsWith("bedroom-desk-leg-"))return furniture[6];
  if(name==="galvik-bed-chest"||name.startsWith("bed-chest-"))return furniture[7];
  if(name==="bed-candle"||name==="bed-candle-holder"||
     name==="bed-side-stool"||name==="bed-side-stool-top")return furniture[8];
  return null;
}
