import { ECONOMY, ITEMS, tradeAtStartOfDay, type ItemId } from "./economy.ts";
import type { GameState } from "./gameState.ts";

/** A read-only forecast of the *same* authoritative day-tick purchase logic.
 * No stock is reserved/removed and no funds are transferred until End Day.
 */
export interface ShoppingInterest {
  readonly itemId: ItemId;
  readonly slotId: string;
  readonly quantity: number;
  readonly subtotal: number;
}
export type ShoppingReason = "interested" | "cannot-afford" | "unavailable" | "no-need";
export interface ShoppingIntent {
  readonly heroId: string;
  readonly items: readonly ShoppingInterest[];
  readonly total: number;
  readonly reason: ShoppingReason;
}
export function forecastShoppingIntents(state: GameState): ReadonlyMap<string, ShoppingIntent> {
  // Treat unpaid carried items as a virtual part of their buyer's inventory
  // and budget, so the next forecast cannot sell the same need or gold twice.
  // This projection NEVER changes the authoritative hero or shop inventory.
  const paidHeroIds=new Set(state.events.filter(event=>
    event.type==="sale" && event.saleChannel==="manual" &&
    event.day===state.day && event.adventurerId)
    .map(event=>event.adventurerId!));
  const cartsByHero=new Map(state.shopCarts.map(cart=>[cart.heroId,cart]));
  const virtualHeroes = state.adventurers.map(hero => {
    const cart = cartsByHero.get(hero.id);
    const paid = paidHeroIds.has(hero.id);
    if (paid) return { ...hero, status: "returning" as const,
      floor: 4 as const, shopStayDays: 0 };
    if (!cart) return hero;
    let food = hero.inventory.food;
    let healing = hero.inventory.healing;
    let weapon = hero.equipment.weapon;
    let armor = hero.equipment.armor;
    let reservedGold = 0;
    for (const line of cart.lines) {
      const item = ITEMS.find(entry => entry.id === line.itemId);
      if (!item) continue;
      reservedGold += line.subtotal;
      if (item.kind === "food") food += line.quantity;
      if (item.kind === "healing") healing += line.quantity;
      if (item.kind === "weapon") weapon = item.name;
      if (item.kind === "armor") armor = item.name;
    }
    return { ...hero, gold: hero.gold - reservedGold,
      inventory: {...hero.inventory, food, healing},
      equipment: {...hero.equipment, weapon, armor} };
  });
  const planningState = { ...state, adventurers: virtualHeroes };
  const projected = tradeAtStartOfDay(planningState, state.day+1);
  const byHero = new Map<string, ShoppingInterest[]>();
  const slotById = new Map(state.shopEconomy.slots.map(slot=>[slot.id,slot]));
  for(const event of projected.events){
    if(event.type!=="sale"||!event.adventurerId||!event.itemId||
      !event.quantity||!event.revenue)continue;
    const slotId=event.id.substring(event.id.lastIndexOf(":sale:")+6);
    const slot=slotById.get(slotId);
    if(!slot||slot.itemId!==event.itemId)continue;
    const current=byHero.get(event.adventurerId)??[];
    current.push({slotId,itemId:event.itemId,quantity:event.quantity,
      subtotal:event.revenue});
    byHero.set(event.adventurerId,current);
  }
  const results=new Map<string,ShoppingIntent>();
  for(const hero of state.adventurers){
    if(hero.status!=="at-shop"||hero.health<=0)continue;
    if(paidHeroIds.has(hero.id))continue;
    const items=byHero.get(hero.id)??[];
    let reason:ShoppingReason="interested";
    if(!items.length){
      const needs=ITEMS.filter(item=>{
        if(item.kind==="food")return hero.inventory.food<ECONOMY.foodTarget;
        if(item.kind==="healing")return hero.health<hero.stats.maxHealth &&
          hero.inventory.healing<ECONOMY.healingTarget;
        if(item.kind==="weapon")return hero.equipment.weapon===null;
        if(item.kind==="armor")return hero.equipment.armor===null;
        return false;
      });
      if(!needs.length)reason="no-need";
      else if(needs.some(item=>state.shopEconomy.slots.some(slot=>
        slot.itemId===item.id && slot.quantity>0))){
        // Earlier heroes may have depleted the shelf or this hero cannot pay.
        reason=needs.some(item=>state.shopEconomy.slots.some(slot=>
          slot.itemId===item.id&&slot.quantity>0&&hero.gold>=item.salePrice))
          ?"unavailable":"cannot-afford";
      }else reason="unavailable";
    }
    results.set(hero.id,{heroId:hero.id,items,total:items.reduce(
      (sum,item)=>sum+item.subtotal,0),reason});
  }
  return results;
}
