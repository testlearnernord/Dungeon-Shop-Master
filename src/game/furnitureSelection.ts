import type { FurnitureId } from "./furnitureBlueprint.ts";
import {SHOP_FLOOR_FURNITURE} from "./shopFloorFurniture.ts";

/** All currently selectable built-in furnishings have a stable movable identity.
 * Persisted transforms are resolved from GameState when focused; this registry
 * only maps visible mesh names to furniture identity and focus dimensions.
 */
export interface LookedAtFurniture {
  readonly id:string;
  readonly label:string;
  readonly movableId:FurnitureId;
  readonly bounds:{width:number;height:number;depth:number};
  readonly focusY:number;
}

const furniture:readonly LookedAtFurniture[]=[
  {id:"shelf-1",label:"Left shelf",movableId:"shelf-1",
    bounds:SHOP_FLOOR_FURNITURE.shelf.focus,focusY:1.27},
  {id:"shelf-2",label:"Right shelf",movableId:"shelf-2",
    bounds:SHOP_FLOOR_FURNITURE.shelf.focus,focusY:1.27},
  {id:"counter",label:"Checkout counter",movableId:"counter",
    bounds:SHOP_FLOOR_FURNITURE.counter.focus,focusY:0.69},
  {id:"adventurer-board",label:"Adventurer board",movableId:"adventurer-board",bounds:{width:3.45,height:2.25,depth:0.22},focusY:2.17},
  {id:"bed",label:"Galvik's bed",movableId:"bed",bounds:{width:1.7,height:1.55,depth:2.5},focusY:0.78},
  {id:"debt-book",label:"Book of Debts · move with desk",movableId:"desk",bounds:{width:1.18,height:1.25,depth:0.76},focusY:0.65},
  {id:"desk",label:"Accounting desk",movableId:"desk",bounds:{width:1.18,height:1.25,depth:0.76},focusY:0.65},
  {id:"chest",label:"Storage chest",movableId:"chest",bounds:{width:1.04,height:0.9,depth:0.72},focusY:0.45},
  {id:"candle",label:"Bedside candle + stool",movableId:"candle",bounds:{width:0.66,height:1.2,depth:0.66},focusY:0.60},
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
