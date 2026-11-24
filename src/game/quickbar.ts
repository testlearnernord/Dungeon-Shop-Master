import {isShelfGood,type ItemId} from "./economy.ts";
export const QUICKBAR_SIZE=6;
export const QUICKBAR_STORAGE_KEY="dsm.quickbar.v1";
export type QuickbarSlot=ItemId|null;
export const quickbarIndexForKey=(code:string):number|null=>
  /^Digit[1-6]$/.test(code)?Number(code.slice(-1))-1:null;
const validIndex=(index:number)=>Number.isInteger(index)&&index>=0&&index<QUICKBAR_SIZE;
export function normalizeQuickbar(raw:unknown):QuickbarSlot[]{
  const seen=new Set<ItemId>();
  return Array.from({length:QUICKBAR_SIZE},(_,i)=>{
    const id=Array.isArray(raw)?raw[i]:null;
    if(typeof id!=="string"||!isShelfGood(id as ItemId)||seen.has(id as ItemId))return null;
    seen.add(id as ItemId);return id as ItemId;
  });
}
/** UI item references only; no quantity or ownership. */
export class Quickbar {
  private entries:QuickbarSlot[];
  private active=0;
  constructor(raw:unknown=[]){this.entries=normalizeQuickbar(raw);}
  get slots():readonly QuickbarSlot[]{return this.entries.slice();}
  get selectedIndex():number{return this.active;}
  get selected():QuickbarSlot{return this.entries[this.active];}
  select(index:number):boolean{
    if(!validIndex(index))return false;
    this.active=index;return true;
  }
  cycle(direction:number):void{
    if(direction)this.active=(this.active+Math.sign(direction)+QUICKBAR_SIZE)%QUICKBAR_SIZE;
  }
  bind(index:number,id:ItemId):boolean{
    if(!validIndex(index)||!isShelfGood(id))return false;
    const old=this.entries.indexOf(id);
    if(old>=0&&old!==index)this.entries[old]=null;
    this.entries[index]=id;return true;
  }
  swap(from:number,to:number):boolean{
    if(!validIndex(from)||!validIndex(to))return false;
    [this.entries[from],this.entries[to]]=[this.entries[to],this.entries[from]];
    return true;
  }
  clear(index:number):boolean{
    if(!validIndex(index))return false;
    this.entries[index]=null;return true;
  }
  indexOf(id:ItemId):number{return this.entries.indexOf(id);}
}
