import { ITEMS, type ItemId } from "./economy.ts";
import type { GameState } from "./gameState.ts";
import { forecastShoppingIntents } from "./shopperIntents.ts";

export interface BeggingQuote {
  readonly heroId:string;
  readonly heroName:string;
  readonly itemId:ItemId;
  readonly itemName:string;
  readonly price:number;
  readonly gold:number;
  readonly available:boolean;
  readonly previousDebt:number;
}

/** A request belongs to the current living, unpaid shop visitor.
 * It is a need the visitor cannot afford, not a fictional sale or discount.
 */
export function quoteBeggingRequest(state:GameState,heroId:string):BeggingQuote|null {
  const hero=state.adventurers.find(entry=>entry.id===heroId);
  if(!hero||hero.status!=="at-shop"||hero.health<=0||
      state.shopCarts.some(cart=>cart.heroId===heroId&&cart.lines.length>0)||
      state.events.some(event=>event.day===state.day&&
        event.adventurerId===heroId&&(event.type==="shop-credit"||
          event.type==="shop-walkout"||
          (event.type==="sale"&&event.saleChannel==="manual"))))
    return null;
  const request=forecastShoppingIntents(state).get(heroId);
  if(request?.reason!=="cannot-afford"||!request.wantedItemId||
      request.items.length>0)return null;
  const item=ITEMS.find(entry=>entry.id===request.wantedItemId);
  if(!item||hero.gold>=item.salePrice)return null;
  const available=state.shopEconomy.slots.some(slot=>
    slot.itemId===item.id&&slot.quantity>0)||
    state.shopEconomy.bag[item.id]>0;
  return {
    heroId,heroName:hero.name,itemId:item.id,itemName:item.name,
    price:item.salePrice,gold:hero.gold,available,
    previousDebt:state.shopDebts.find(entry=>entry.heroId===heroId)?.outstandingGold??0,
  };
}

export interface CreditResult {
  readonly state:GameState;
  readonly message:string;
}

/** One unpaid need per visitor per day. The player must approve the request.
 * Stock and item ownership change immediately; merchant revenue stays at zero.
 */
export function issueShopCredit(state:GameState,heroId:string):CreditResult {
  const quote=quoteBeggingRequest(state,heroId);
  if(!quote)return {state,message:"This adventurer has no eligible credit request."};
  if(!quote.available)return {state,message:"No "+quote.itemName+" in shelves or bag."};
  if(!Number.isSafeInteger(quote.previousDebt+quote.price))
    return {state,message:"The debt ledger cannot hold this amount."};

  const item=ITEMS.find(entry=>entry.id===quote.itemId)!;
  const hero=state.adventurers.find(entry=>entry.id===heroId)!;
  const stockSlot=state.shopEconomy.slots.find(slot=>
    slot.itemId===item.id&&slot.quantity>0);
  const economy=stockSlot
    ? {...state.shopEconomy,slots:state.shopEconomy.slots.map(slot=>
        slot.id!==stockSlot.id?slot:{
          ...slot,quantity:slot.quantity-1,
          itemId:slot.quantity===1?null:slot.itemId,
        })}
    : {...state.shopEconomy,bag:{
        ...state.shopEconomy.bag,
        [item.id]:state.shopEconomy.bag[item.id]-1,
      }};

  const inventory={...hero.inventory,
    bread:hero.inventory.bread+(item.id==="bread"?1:0),
    healing:hero.inventory.healing+(item.id==="healing-herb"?1:0)};
  const equipment={...hero.equipment,
    weapon:item.kind==="weapon"?item.name:hero.equipment.weapon,
    armor:item.kind==="armor"?item.name:hero.equipment.armor};
  const previous=state.shopDebts.find(entry=>entry.heroId===heroId);
  const shopDebts=previous
    ?state.shopDebts.map(entry=>entry.heroId===heroId
      ?{...entry,outstandingGold:entry.outstandingGold+quote.price}:entry)
    :[...state.shopDebts,{heroId,outstandingGold:quote.price}];
  const event={
    id:`day-${state.day}:${heroId}:shop-credit`,
    type:"shop-credit" as const,day:state.day,
    adventurerId:heroId,itemId:item.id,quantity:1,debtGold:quote.price,
    message:`${hero.name} received 1 ${item.name} on credit and now owes ${quote.previousDebt+quote.price} gold.`,
  };
  return {
    state:{
      ...state,
      shopEconomy:economy,
      shopDebts,
      adventurers:state.adventurers.map(person=>
        person.id===heroId?{...person,inventory,equipment,
          status:"returning" as const,floor:4 as const,shopStayDays:0}:person),
      events:[...state.events,event],
    },
    message:`${hero.name} owes Galvik ${quote.previousDebt+quote.price}g. 1 ${item.name} issued on credit.`,
  };
}
