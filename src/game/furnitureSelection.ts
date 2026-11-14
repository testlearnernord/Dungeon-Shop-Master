import type { FurnitureId } from "./furnitureBlueprint.ts";

/** All visible built-in furnishings have a stable identity, not a keyboard slot.
 * Legacy shelves and counter already have persisted transforms. Bedroom and
 * room fixtures are discovered now but remain fixed until their transforms,
 * interaction anchors, lights and support geometry have a validated save schema.
 */
export interface LookedAtFurniture {
  readonly id:string;
  readonly label:string;
  readonly movableId:FurnitureId|null;
  readonly bounds:{width:number;height:number;depth:number};
  readonly position:{x:number;y:number;z:number};
}

const furniture:readonly LookedAtFurniture[]=[
  {id:"shelf-1",label:"Left shelf",movableId:"shelf-1",bounds:{width:1.36,height:2.35,depth:6.1},position:{x:-6.52,y:1.27,z:0}},
  {id:"shelf-2",label:"Right shelf",movableId:"shelf-2",bounds:{width:1.36,height:2.35,depth:6.1},position:{x:6.52,y:1.27,z:0}},
  {id:"counter",label:"Checkout counter",movableId:"counter",bounds:{width:2.5,height:1.8,depth:2.3},position:{x:0,y:0.95,z:2.5}},
  {id:"adventurer-board",label:"Adventurer board",movableId:null,bounds:{width:3.45,height:2.25,depth:0.22},position:{x:-5.55,y:2.17,z:-6.45}},
  {id:"bed",label:"Galvik's bed",movableId:null,bounds:{width:1.7,height:1.55,depth:2.5},position:{x:0.8,y:0.78,z:-10.6}},
  {id:"debt-book",label:"Book of Debts · move with desk",movableId:"desk",bounds:{width:1.18,height:1.25,depth:0.76},position:{x:-2.27,y:0.65,z:-9.08}},
  {id:"desk",label:"Accounting desk",movableId:"desk",bounds:{width:1.18,height:1.25,depth:0.76},position:{x:-2.27,y:0.65,z:-9.08}},
  {id:"chest",label:"Storage chest",movableId:"chest",bounds:{width:1.04,height:0.9,depth:0.72},position:{x:-2.15,y:0.45,z:-11.3}},
  {id:"candle",label:"Bedside candle + stool",movableId:"candle",bounds:{width:0.66,height:1.2,depth:0.66},position:{x:2.25,y:0.60,z:-10.95}},
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
