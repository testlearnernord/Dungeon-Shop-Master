import {BUYBACK_DOCK} from "./buybackChestPlacement.ts";
import {currentShopVisitEvents} from "./npcVisitors.ts";
import type {GameState,WorldEvent} from "./gameState.ts";
import {MATERIAL_ITEMS,ITEMS,ECONOMY,type MaterialItemId,type ItemId} from "./economy.ts";
import {canBuySurveyorPlan,surveyorPlanReceipt,SURVEYOR_PLAN_PRICE} from "./dungeonDiscovery.ts";

export interface ChestMaterial {
  readonly heroId:string;
  readonly itemId:MaterialItemId;
  readonly count:number;
  readonly price:number;
}
export function dungeonBuybackPrice(id:MaterialItemId):number{
  const item=MATERIAL_ITEMS.find(entry=>entry.id===id);
  if(!item)throw new RangeError("The chest accepts workshop materials only.");
  return Math.max(1,Math.min(item.wholesaleCost,item.salePrice-1));
}
/** Read-only real material ownership, not a separate offer inventory. */
export function availableChestMaterials(state:GameState,heroId?:string):readonly ChestMaterial[]{
  return state.adventurers.flatMap(hero=>{
    if((heroId!==undefined&&hero.id!==heroId)||hero.status!=="at-shop"||
      hero.floor!=="shop"||hero.health<=0)return [];
    return MATERIAL_ITEMS.flatMap(item=>{
      const count=hero.inventory.finds?.[item.id]??0;
      return count>0?[{heroId:hero.id,itemId:item.id,count,price:dungeonBuybackPrice(item.id)}]:[];
    });
  });
}
export function wantsChestBuyback(state:GameState,heroId:string):boolean{
  if(!state.buybackChestOpen||state.shopCarts.some(c=>c.heroId===heroId)||
    state.shopRequests.some(r=>r.heroId===heroId))return false;
  if(currentShopVisitEvents(state.events,state.day,heroId).some(e=>
    e.type==="hero-buyback"||e.type==="discovery-buyback"||e.type==="sale"||e.type==="shop-credit"||e.type==="shop-walkout"))return false;
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero)return false;
  return canBuySurveyorPlan(state,heroId)||availableChestMaterials(state,heroId).some(o=>
    o.price<=state.shopEconomy.balance&&hero.gold<=Number.MAX_SAFE_INTEGER-o.price&&
    state.shopEconomy.materialStorage[o.itemId]<Number.MAX_SAFE_INTEGER);
}
/** The only buyback mutation. One atomic paid drop-off; one auditable
 * receipt per unit, using the existing expense ledger contract.
 * The physical motor supplies its reached position; headless fixtures
 * explicitly model an ideal service arrival at that same dock. */
export function buybackAtChest(state:GameState,heroId:string,position:{x:number;z:number}):GameState{
  if(!Number.isFinite(position.x)||!Number.isFinite(position.z)||
    Math.hypot(position.x-BUYBACK_DOCK.x,position.z-BUYBACK_DOCK.z)>.3||
    !wantsChestBuyback(state,heroId))return state;
  const hero=state.adventurers.find(h=>h.id===heroId)!;
  const finds={...hero.inventory.finds};
  const reserve={...state.shopEconomy.materialStorage};
  let balance=state.shopEconomy.balance,gold=hero.gold;
  const receipts:WorldEvent[]=[];
  let surveyorPlan=state.surveyorPlan;
  // Buy the unique discovery first; the remaining balance funds ordinary materials.
  if(surveyorPlan&&canBuySurveyorPlan(state,heroId)){
    balance-=SURVEYOR_PLAN_PRICE;gold+=SURVEYOR_PLAN_PRICE;
    surveyorPlan={...surveyorPlan,status:"purchased"};
    receipts.push(surveyorPlanReceipt(hero,state.day));
  }
  for(const offer of availableChestMaterials(state,heroId)){
    const id=offer.itemId,price=offer.price;
    const n=Math.min(offer.count,Math.floor(balance/price),
      Math.floor((Number.MAX_SAFE_INTEGER-gold)/price),Number.MAX_SAFE_INTEGER-reserve[id]);
    if(n<=0)continue;
    balance-=n*price;gold+=n*price;reserve[id]+=n;
    const remaining=(finds[id]??0)-n;
    if(remaining===0)delete finds[id];else finds[id]=remaining;
    const prefix="day-"+state.day+":"+heroId+":hero-buyback:"+id+":";
    const prior=state.events.filter(e=>e.id.startsWith(prefix)).length;
    const label=MATERIAL_ITEMS.find(m=>m.id===id)!.name;
    for(let i=1;i<=n;i++)receipts.push({
      id:prefix+(prior+i),type:"hero-buyback",day:state.day,adventurerId:heroId,
      itemId:id,quantity:1,cost:price,
      message:"Galvik bought 1 "+label+" from "+hero.name+" for "+price+" gold.",
    });
  }
  if(!receipts.length)return state;
  return {...state,adventurers:state.adventurers.map(h=>h.id===heroId?
    {...h,gold,inventory:{...h.inventory,finds}}:h),
    surveyorPlan,
    shopEconomy:{...state.shopEconomy,balance,materialStorage:reserve},
    events:[...state.events,...receipts]};
}

/** Used gear is never auto-purchased. Offers are projections of real ownership. */
export function usedGearPrice(id:ItemId):number{
  const item=ITEMS.find(i=>i.id===id);
  if(!item||(item.kind!=="weapon"&&item.kind!=="armor"))throw new RangeError("Not equipment.");
  return Math.max(1,Math.floor(item.salePrice/2));
}
export function availableUsedGear(state:GameState,heroId:string){
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero||hero.status!=="at-shop"||hero.floor!=="shop"||hero.health<=0)return [];
  return ITEMS.filter(i=>i.kind==="weapon"||i.kind==="armor").flatMap(item=>{
    const count=hero.inventory.finds?.[item.id]??0;
    return count>0?[{heroId,itemId:item.id,count,price:usedGearPrice(item.id)}]:[];
  });
}
/** Explicit acceptance at the physical dock, one item per transaction. */
export function acceptUsedGearAtChest(state:GameState,heroId:string,itemId:ItemId,position:{x:number;z:number}):GameState{
  if(!state.buybackChestOpen||!Number.isFinite(position.x)||!Number.isFinite(position.z)||
    Math.hypot(position.x-BUYBACK_DOCK.x,position.z-BUYBACK_DOCK.z)>.3)return state;
  const offer=availableUsedGear(state,heroId).find(o=>o.itemId===itemId);
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!offer||!hero||state.shopEconomy.balance<offer.price||
    hero.gold>Number.MAX_SAFE_INTEGER-offer.price||
    Object.values(state.shopEconomy.bag).reduce((a,b)=>a+b,0)>=ECONOMY.bagCapacity)return state;
  const finds={...hero.inventory.finds};
  if(offer.count===1)delete finds[itemId];else finds[itemId]=offer.count-1;
  const prefix="day-"+state.day+":"+heroId+":hero-buyback:"+itemId+":";
  const serial=state.events.filter(e=>e.id.startsWith(prefix)).length+1;
  const receipt:WorldEvent={id:prefix+serial,type:"hero-buyback",day:state.day,
    adventurerId:heroId,itemId,quantity:1,cost:offer.price,
    message:hero.name+" sold used "+ITEMS.find(i=>i.id===itemId)!.name+" for "+offer.price+" gold."};
  return {...state,adventurers:state.adventurers.map(h=>h.id===heroId?
    {...h,gold:h.gold+offer.price,inventory:{...h.inventory,finds}}:h),
    shopEconomy:{...state.shopEconomy,balance:state.shopEconomy.balance-offer.price,
      bag:{...state.shopEconomy.bag,[itemId]:state.shopEconomy.bag[itemId]+1}},
    events:[...state.events,receipt]};
}
