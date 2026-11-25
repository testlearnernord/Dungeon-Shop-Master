import {BUYBACK_DOCK} from "./buybackChestPlacement.ts";
import {currentShopVisitEvents} from "./npcVisitors.ts";
import type {GameState,WorldEvent} from "./gameState.ts";
import {ECONOMY,ITEMS,isMaterial,type ItemId} from "./economy.ts";

export interface HeroDungeonOffer {
  readonly heroId:string;
  readonly heroName:string;
  readonly itemId:ItemId;
  readonly count:number;
  readonly price:number;
}
export function dungeonBuybackPrice(id:ItemId):number{
  const item=ITEMS.find(entry=>entry.id===id);
  if(!item)throw new RangeError("Unknown dungeon find");
  return Math.max(1,Math.min(item.wholesaleCost,item.salePrice-1));
}
/** Offers are real, owned goods carried by heroes who physically returned to
 * Galvik's shop. No viewer projection, fake stock, or automatic hero sale. */
export function availableDungeonOffers(state:GameState):readonly HeroDungeonOffer[]{
  return state.adventurers.flatMap(hero=>{
    if(hero.status!=="at-shop"||hero.floor!=="shop"||hero.health<=0)return [];
    return Object.entries(hero.inventory.finds??{}).flatMap(([id,count])=>{
      const item=ITEMS.find(entry=>entry.id===id);
      return item&&count&&count>0?[{
        heroId:hero.id,heroName:hero.name,itemId:item.id as ItemId,
        count,price:dungeonBuybackPrice(item.id as ItemId),
      }]:[];
    });
  });
}
export function buyHeroDungeonFind(
  state:GameState,heroId:string,itemId:ItemId,
):{state:GameState;message:string}{
  const offer=availableDungeonOffers(state).find(o=>
    o.heroId===heroId&&o.itemId===itemId);
  if(!offer)return {state,message:"That adventurer has no such goods to sell."};
  const held=Object.values(state.shopEconomy.bag).reduce((a,b)=>a+b,0);
  if(!isMaterial(itemId)&&held>=ECONOMY.bagCapacity)
    return {state,message:"Galvik's bag is full."};
  if(state.shopEconomy.balance<offer.price)
    return {state,message:"Not enough gold for this offer."};
  if(isMaterial(itemId)&&state.shopEconomy.materialStorage[itemId]>=Number.MAX_SAFE_INTEGER)
    return {state,message:"The workshop reserve is at its numeric limit."};
  const hero=state.adventurers.find(h=>h.id===heroId)!;
  if(hero.gold+offer.price>Number.MAX_SAFE_INTEGER)
    return {state,message:"The trade would exceed the gold ledger."};
  const finds={...hero.inventory.finds};
  const left=(finds[itemId]??0)-1;
  if(left===0)delete finds[itemId];
  else finds[itemId]=left;
  const prefix="day-"+state.day+":"+heroId+":hero-buyback:"+itemId+":";
  const serial=state.events.filter(e=>e.id.startsWith(prefix)).length+1;
  const event:WorldEvent={
    id:prefix+serial,type:"hero-buyback",day:state.day,adventurerId:heroId,
    itemId,quantity:1,cost:offer.price,
    message:"Galvik bought 1 "+ITEMS.find(item=>item.id===itemId)!.name+
      " from "+hero.name+" for "+offer.price+" gold.",
  };
  return {state:{...state,
    adventurers:state.adventurers.map(member=>member.id===heroId?
      {...member,gold:member.gold+offer.price,
        inventory:{...member.inventory,finds}}:member),
    shopEconomy:{...state.shopEconomy,
      balance:state.shopEconomy.balance-offer.price,
      // Materials go straight into the saved workshop reserve and never
      // consume Galvik's 24 carried shop-goods slots.
      materialStorage:isMaterial(itemId)?{
        ...state.shopEconomy.materialStorage,
        [itemId]:state.shopEconomy.materialStorage[itemId]+1,
      }:state.shopEconomy.materialStorage,
      bag:isMaterial(itemId)?state.shopEconomy.bag:{
        ...state.shopEconomy.bag,
        [itemId]:(state.shopEconomy.bag[itemId]??0)+1}},
    events:[...state.events,event],
  },message:event.message};
}

/** Only workshop materials in V0.1; other recovered goods stay owned.
 * The existing one-unit paid exchange is the sole ledger authority. */
export function wantsChestBuyback(state:GameState,heroId:string):boolean{
  if(!state.buybackChestOpen||state.shopCarts.some(c=>c.heroId===heroId)||
    state.shopRequests.some(r=>r.heroId===heroId))return false;
  if(currentShopVisitEvents(state.events,state.day,heroId).some(e=>e.type==="hero-buyback"||e.type==="sale"))return false;
  return availableDungeonOffers(state).some(o=>o.heroId===heroId&&isMaterial(o.itemId)&&
    o.price<=state.shopEconomy.balance&&state.shopEconomy.materialStorage[o.itemId]<Number.MAX_SAFE_INTEGER);
}
export function buybackAtChest(state:GameState,heroId:string,position:{x:number;z:number}):GameState{
  if(!Number.isFinite(position.x)||!Number.isFinite(position.z)||
    Math.hypot(position.x-BUYBACK_DOCK.x,position.z-BUYBACK_DOCK.z)>.3||
    !wantsChestBuyback(state,heroId))return state;
  let next=state;
  for(const offer of availableDungeonOffers(state).filter(o=>o.heroId===heroId&&isMaterial(o.itemId))){
    for(let i=0;i<offer.count;i++){
      const result=buyHeroDungeonFind(next,heroId,offer.itemId);
      if(result.state===next)break;
      next=result.state;
    }
  }
  return next;
}
