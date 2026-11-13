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
  /** Requested sprite when unmet affordable needs have no stock. */
  readonly wantedItemId?: ItemId;
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
    let bread = hero.inventory.bread;
    let healing = hero.inventory.healing;
    let weapon = hero.equipment.weapon;
    let armor = hero.equipment.armor;
    let reservedGold = 0;
    for (const line of cart.lines) {
      const item = ITEMS.find(entry => entry.id === line.itemId);
      if (!item) continue;
      reservedGold += line.subtotal;
      if (item.id === "bread") bread += line.quantity;
      if (item.id === "healing-herb") healing += line.quantity;
      if (item.kind === "weapon") weapon = item.name;
      if (item.kind === "armor") armor = item.name;
    }
    return { ...hero, gold: hero.gold - reservedGold,
      inventory: {...hero.inventory, bread, healing},
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
        const uncovered=Math.max(8,hero.stats.maxHealth-hero.health)-
          hero.inventory.bread*8-hero.inventory.healing*18;
        if(item.id==="bread")return uncovered>0 &&
          hero.inventory.bread<ECONOMY.breadCarryLimit;
        if(item.id==="healing-herb")return uncovered>0 &&
          hero.inventory.healing<ECONOMY.herbCarryLimit;
        if(item.kind==="weapon")return hero.equipment.weapon===null;
        if(item.kind==="armor")return hero.equipment.armor===null;
        return false;
      });
      if(!needs.length)reason="no-need";
      else if(needs.some(item=>hero.gold>=item.salePrice)){
        // Classify affordability against ALL unmet needs, not just goods
        // currently on shelves. A hero with 4g can afford sold-out Waybread
        // even if the only stocked product is a 9g sword. The empty forecast
        // then means the affordable need is unavailable (or sold to an
        // earlier buyer), so the 60-second restock wait must apply.
        reason="unavailable";
      }else reason="cannot-afford";
    }
    // Choose one truthful unmet need for an out-of-stock request bubble.
    // Injuries determine whether cheap bread or the stronger herb comes first.
    const projectedHero=virtualHeroes.find(entry=>entry.id===hero.id)??hero;
    const wound=projectedHero.stats.maxHealth-projectedHero.health;
    const priorities:readonly ItemId[]=wound<=8
      ? ["bread","healing-herb","iron-sword","leather-vest"]
      : ["healing-herb","bread","iron-sword","leather-vest"];
    const wantedItemId=(reason==="unavailable"||reason==="cannot-afford")?
      priorities.find(id=>{
        const item=ITEMS.find(entry=>entry.id===id)!;
        if(reason==="unavailable"&&projectedHero.gold<item.salePrice)return false;
        const uncovered=Math.max(8,wound)-projectedHero.inventory.bread*8-
          projectedHero.inventory.healing*18;
        if(id==="bread")return uncovered>0&&
          projectedHero.inventory.bread<ECONOMY.breadCarryLimit;
        if(id==="healing-herb")return uncovered>0&&
          projectedHero.inventory.healing<ECONOMY.herbCarryLimit;
        if(id==="iron-sword")return projectedHero.equipment.weapon===null;
        return projectedHero.equipment.armor===null;
      }):undefined;
    results.set(hero.id,{heroId:hero.id,items,total:items.reduce(
      (sum,item)=>sum+item.subtotal,0),reason,wantedItemId});
  }
  return results;
}

/** Visual-only intent, kept separate from the authoritative day-tick trade. */
export type ShopperVisualAction = "shop"|"checkout"|"wait-restock"|"beg"|"leave-unserved";
export function shopperVisualAction(
  intent: ShoppingIntent | null, hasUnpaidCart: boolean,
): ShopperVisualAction {
  if (hasUnpaidCart) return "checkout";
  if (intent?.items.length) return "shop";
  if (intent?.reason==="cannot-afford"&&intent.wantedItemId)return "beg";
  return intent?.reason==="unavailable"&&intent.wantedItemId
    ? "wait-restock":"leave-unserved";
}

/** Real seconds after arriving at the waiting spot; unrelated shop changes
 * must never renew this window. */
export const RESTOCK_WAIT_SECONDS=60;
export function restockWaitRemaining(previous:number,elapsed:number):number {
  if(!Number.isFinite(previous)||!Number.isFinite(elapsed)||elapsed<0)
    throw new RangeError("Restock timer must be finite and nonnegative.");
  return Math.max(0,previous-elapsed);
}
