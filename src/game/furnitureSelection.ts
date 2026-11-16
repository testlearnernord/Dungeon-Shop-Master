import type { FurnitureId } from "./furnitureBlueprint.ts";
import {isShelfId} from "./shopLayout.ts";
import {furnitureDefinition,type FurnitureKind} from "./furnitureRegistry.ts";

/** All placed furnishings have a stable identity, not a keyboard slot.
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
  const definition=furnitureDefinition(id);
  if(definition.focus)return definition.focus;
  const {width,height,depth}=definition;
  return {width,height,depth};
};

const furniture:readonly LookedAtFurniture[]=[
  {id:"counter",label:"Checkout counter",movableId:"counter",
    bounds:bounds("counter"),focusY:0.69},
  {id:"adventurer-board",label:"Adventurer board",movableId:"adventurer-board",bounds:bounds("adventurer-board"),focusY:2.17},
  {id:"bed",label:"Galvik's bed",movableId:"bed",bounds:bounds("bed"),focusY:0.78},
  {id:"debt-book",label:"Book of Debts · move with desk",movableId:"desk",bounds:bounds("desk"),focusY:0.65},
  {id:"desk",label:"Accounting desk",movableId:"desk",bounds:bounds("desk"),focusY:0.65},
  {id:"chest",label:"Storage chest",movableId:"chest",bounds:bounds("chest"),focusY:0.45},
  {id:"candle",label:"Bedside candle + stool",movableId:"candle",bounds:bounds("candle"),focusY:0.60},
  {id:"galvik-portrait",label:"Portrait of Galvik's lost beloved",
    movableId:"galvik-portrait",bounds:bounds("galvik-portrait"),focusY:2.15},
];

/** Mesh names, including their component pieces, resolve to one furniture.
 * Avoid selecting rock, NPCs, product labels, or stock items as furniture.
 */
export function classifyFurnitureMesh(name:string):LookedAtFurniture|null {
  const shelfMatch=/^(shelf-[1-9][0-9]*)-(?:slot-|back|plank|root|placement-preview)/.exec(name);
  if(shelfMatch&&isShelfId(shelfMatch[1])){
    const id=shelfMatch[1];
    const {focus,width,height,depth}=furnitureDefinition(id);
    return {id,label:"Shelf "+id.slice(6),movableId:id,
      bounds:focus??{width,height,depth},focusY:0.93};
  }
  if(["checkout-counter","counter-top","register-base","cash-register"].includes(name))
    return furniture[0];
  if(name==="adventurer-roster-board"||name.startsWith("roster-frame-"))
    return furniture[1];
  if(name==="galvik-bed"||/^bed-(frame|post|headboard|footboard|blanket|quilt|pillow)/.test(name))
    return furniture[2];
  if(/^bedroom-account-(book|pages|spine)$/.test(name))return furniture[3];
  if(name==="bedroom-desk"||name.startsWith("bedroom-desk-leg-"))return furniture[4];
  if(name==="galvik-bed-chest"||name.startsWith("bed-chest-"))return furniture[5];
  if(name==="bed-candle"||name==="bed-candle-holder"||
     name==="bed-side-stool"||name==="bed-side-stool-top")return furniture[6];
  if(name.startsWith("galvik-portrait-"))return furniture[7];
  return null;
}
