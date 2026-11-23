import type { FurnitureId } from "./furnitureBlueprint.ts";
import {isShelfId} from "./shopLayout.ts";
import {furnitureDefinition,type FurnitureKind} from "./furnitureRegistry.ts";

export interface LookedAtFurniture {
  readonly id:string;
  readonly label:string;
  readonly movableId:FurnitureId;
  readonly bounds:{width:number;height:number;depth:number};
  readonly focusY:number;
}
const looked=(id:string,movableId:FurnitureId,label?:string):LookedAtFurniture=>{
  const definition=furnitureDefinition(movableId as FurnitureKind);
  return {id,label:label??definition.label,movableId,
    bounds:definition.focus??{
      width:definition.width,height:definition.height,depth:definition.depth,
    },focusY:definition.focusY};
};
const counter=looked("counter","counter");
const board=looked("adventurer-board","adventurer-board");
const bed=looked("bed","bed");
const debtBook=looked("debt-book","desk","Book of Debts · move with desk");
const desk=looked("desk","desk");
const chest=looked("chest","chest");
const candle=looked("candle","candle");
const cellarChest=looked("cellar-chest","cellar-chest");
const cellarTable=looked("cellar-table","cellar-table");
const wallClock=looked("world-clock","world-clock");

export function classifyFurnitureMesh(name:string):LookedAtFurniture|null {
  const shelfMatch=/^(shelf-[1-9][0-9]*)-(?:slot-|back|plank|root|placement-preview)/.exec(name);
  if(shelfMatch&&isShelfId(shelfMatch[1])){
    const id=shelfMatch[1];
    return looked(id,id,"Shelf "+id.slice(6));
  }
  if(["checkout-counter","counter-top","register-base","cash-register"].includes(name))
    return counter;
  if(name==="adventurer-roster-board"||name.startsWith("roster-frame-"))return board;
  if(name==="galvik-bed"||/^bed-(frame|post|headboard|footboard|blanket|quilt|pillow)/.test(name))
    return bed;
  if(/^bedroom-account-(book|pages|spine)$/.test(name))return debtBook;
  if(name==="bedroom-desk"||name.startsWith("bedroom-desk-leg-"))return desk;
  if(name==="galvik-bed-chest"||name.startsWith("bed-chest-"))return chest;
  if(name==="bed-candle"||name==="bed-candle-holder"||
     name==="bed-side-stool"||name==="bed-side-stool-top")return candle;
  if(name.startsWith("cellar-chest-"))return cellarChest;
  if(name.startsWith("cellar-table-"))return cellarTable;
  if(name.startsWith("world-clock-"))return wallClock;
  return null;
}
