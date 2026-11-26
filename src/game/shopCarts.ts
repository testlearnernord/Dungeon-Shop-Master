import {currentShopVisitEvents,shopVisitSuffix} from "./npcVisitors.ts";
import { ITEMS, type ItemId } from "./economy.ts";
import {gearForItem,needsGearUpgrade} from "./gearCatalog.ts";
import type { GameState, WorldEvent } from "./gameState.ts";
import { forecastShoppingIntents, type ShoppingInterest } from "./shopperIntents.ts";

/** Durable, still-unpaid goods physically picked from a shelf. */
export interface ShopCart {
  readonly heroId: string;
  readonly day: number;
  readonly lines: readonly ShoppingInterest[];
}

export function cartTotal(cart: ShopCart): number {
  return cart.lines.reduce((sum, line) => sum + line.subtotal, 0);
}

export interface CartActionResult {
  readonly state: GameState;
  readonly message: string;
}

const failed = (state: GameState, message: string): CartActionResult =>
  ({state, message});

function alreadyPaid(state: GameState, heroId: string): boolean {
  return currentShopVisitEvents(state.events,state.day,heroId)
    .some(event=>event.type==="sale"&&event.saleChannel==="manual");
}

/**
 * Called only when a 3D visitor has reached the actual stocked shelf.
 * All reservations live in GameState and reduce only physical shelf stock.
 * They do not award goods, deduct gold or emit a receipt until settlement.
 */
export function pickUpShopItem(
  state: GameState, heroId: string, slotId: string,
): CartActionResult {
  const hero = state.adventurers.find(person => person.id === heroId);
  if (!hero || hero.status !== "at-shop" || hero.health <= 0 ||
      alreadyPaid(state, heroId))
    return failed(state, "The customer is not shopping.");
  const existing = state.shopCarts.find(cart => cart.heroId === heroId);
  if (existing && (existing.day !== state.day ||
      existing.lines.some(line => line.slotId === slotId)))
    return failed(state, "That item has already been picked up.");

  const proposed = forecastShoppingIntents(state).get(heroId)?.items
    .find(line => line.slotId === slotId);
  const slot = state.shopEconomy.slots.find(entry => entry.id === slotId);
  const item = ITEMS.find(entry => entry.id === proposed?.itemId);
  if (!proposed || !slot || !item || slot.itemId !== item.id ||
      proposed.quantity < 1 || slot.quantity < proposed.quantity ||
      proposed.subtotal !== proposed.quantity * item.salePrice)
    return failed(state, "The requested item is no longer on that shelf.");

  const reservedTotal = (existing ? cartTotal(existing) : 0) + proposed.subtotal;
  if (!Number.isSafeInteger(reservedTotal) || reservedTotal > hero.gold)
    return failed(state, "The customer cannot afford the items.");

  const line: ShoppingInterest = { ...proposed };
  const nextCart: ShopCart = existing
    ? { ...existing, lines: [...existing.lines, line] }
    : {heroId, day:state.day, lines:[line]};
  const remaining = slot.quantity - proposed.quantity;
  return {
    state: {
      ...state,
      shopCarts: existing
        ? state.shopCarts.map(cart => cart.heroId === heroId ? nextCart : cart)
        : [...state.shopCarts, nextCart],
      shopEconomy: {
        ...state.shopEconomy,
        slots: state.shopEconomy.slots.map(entry => entry.id === slotId
          ? { ...entry, quantity: remaining }
          : entry),
      },
    },
    message: hero.name + " picked up " + proposed.quantity + " " + item.name +
      " (unpaid).",
  };
}

/** Goods are returned, not refunded: no money was ever transferred. */
export function returnShopCart(
  state: GameState, heroId: string,
): CartActionResult {
  const cart = state.shopCarts.find(candidate => candidate.heroId === heroId);
  if (!cart) return failed(state, "This customer has no unpaid items.");
  const nextSlots = state.shopEconomy.slots.map(slot => {
    const line = cart.lines.find(candidate => candidate.slotId === slot.id);
    if (!line) return slot;
    if ((slot.itemId !== null && slot.itemId !== line.itemId) ||
        slot.quantity + line.quantity > slot.capacity)
      return null;
    return { ...slot, itemId: line.itemId, quantity: slot.quantity + line.quantity };
  });
  if (nextSlots.some(slot => slot === null))
    return failed(state, "There is no room to return the reserved items.");
  return {
    state: {
      ...state,
      shopCarts: state.shopCarts.filter(candidate => candidate.heroId !== heroId),
      shopEconomy: {
        ...state.shopEconomy,
        slots: nextSlots as GameState["shopEconomy"]["slots"],
      },
    },
    message: "The unpaid cart has been returned to its shelves.",
  };
}

/** Atomic held-cart settlement core, called by the real staffed till ONLY.
 * End Day must always RETURN unpaid goods, never fabricate a payment.
 */
export function settleHeldShopCarts(
  state: GameState, nextDay: number,
): {readonly state: GameState; readonly events: readonly WorldEvent[];
    readonly settledIds: ReadonlySet<string>} {
  if (state.shopCarts.length === 0) {
    return {state, events: [], settledIds: new Set()};
  }
  let result: GameState = state;
  const events: WorldEvent[] = [];
  const settledIds = new Set<string>();
  for (const cart of state.shopCarts) {
    const hero = result.adventurers.find(person => person.id === cart.heroId);
    if (!hero || hero.status !== "at-shop" || hero.health <= 0 ||
        cart.day !== state.day || alreadyPaid(result, cart.heroId))
      throw new Error("An unpaid shopping cart has an invalid customer or day.");
    const total = cartTotal(cart);
    if (!Number.isSafeInteger(total) || total <= 0 || hero.gold < total ||
        !Number.isSafeInteger(result.shopEconomy.balance + total))
      throw new Error("An unpaid shopping cart has an invalid total.");

    let bread = hero.inventory.bread;
    let healing = hero.inventory.healing;
    let weapon = hero.equipment.weapon;
    let armor = hero.equipment.armor;
    let units = 0;
    for (const line of cart.lines) {
      const item = ITEMS.find(candidate => candidate.id === line.itemId);
      if (!item || line.subtotal !== line.quantity * item.salePrice ||
          line.quantity < 1 || !Number.isSafeInteger(line.quantity))
        throw new Error("An unpaid shopping cart contains invalid stock.");
      units += line.quantity;
      if (item.id === "bread") bread += line.quantity;
      else if (item.id === "healing-herb") healing += line.quantity;
      else if (item.kind === "weapon" || item.kind === "armor") {
        if(line.quantity!==1 ||
           !needsGearUpgrade(hero.role,{weapon,armor},item.id))
          throw new Error("Reserved equipment does not suit the hero's class or tier.");
        const gear=gearForItem(item.id);
        if(!gear)throw new Error("Unknown reserved equipment.");
        if(item.kind==="weapon")weapon=gear.name;
        else armor=gear.name;
      }
      else throw new Error("Unsupported reserved item type.");
      events.push({
        id: "day-" + nextDay + ":" + hero.id + ":sale:" + line.slotId,
        type: "sale", saleChannel: "reserved",
        day: nextDay, adventurerId: hero.id,
        itemId: line.itemId, quantity: line.quantity, revenue: line.subtotal,
        message: hero.name + " bought " + line.quantity + " " + item.name +
          " for " + line.subtotal + " gold.",
      });
    }
    result = {
      ...result,
      adventurers: result.adventurers.map(person => person.id === hero.id
        ? {...person, gold: person.gold-total,
          inventory: {...person.inventory,bread,healing},
          equipment: {...person.equipment,weapon,armor}}
        : person),
      shopEconomy: {
        ...result.shopEconomy,
        balance: result.shopEconomy.balance + total,
        dailySales: {
          day: nextDay,
          units: (result.shopEconomy.dailySales.day === nextDay
            ? result.shopEconomy.dailySales.units : 0) + units,
          revenue: (result.shopEconomy.dailySales.day === nextDay
            ? result.shopEconomy.dailySales.revenue : 0) + total,
        },
      },
    };
    settledIds.add(hero.id);
  }
  return {state:{...result, shopCarts: []}, events, settledIds};
}

/** Return every outstanding unpaid cart before bed-based closing.
 * The player never receives money for goods that weren't checked out.
 * Failure is explicit and atomic: no partial shop closing may drop stock.
 */
export function returnUnpaidCartsAtClose(state:GameState):GameState {
  let current=state;
  for(const cart of state.shopCarts){
    if(!cart.lines.every(line=>current.shopEconomy.slots.some(slot=>
        slot.id===line.slotId)))
      throw new Error("Unpaid cart references a missing shelf slot at shop close.");
    const result=returnShopCart(current,cart.heroId);
    if(result.state===current)throw new Error("Unpaid cart could not be returned at shop close.");
    current=result.state;
  }
  return current;
}

/**
 * Staffed register: settle exactly one physically reserved cart.
 * Reuses the validated reservation settlement, which never consumes shelf
 * stock twice (the stock was removed when the hero picked it up).
 * No forecast-only checkout can write a sale or modify inventory.
 */
export function payReservedShopCart(state:GameState,heroId:string,perfectTiming=false,employeeName?:string):CartActionResult {
  const cart=state.shopCarts.find(entry=>entry.heroId===heroId);
  const hero=state.adventurers.find(entry=>entry.id===heroId);
  if(!cart||!hero||hero.status!=="at-shop"||cart.day!==state.day||
      alreadyPaid(state,heroId))
    return failed(state,"This customer has no payable cart.");
  const total=cartTotal(cart);
  if(total<=0||hero.gold<total)
    return failed(state,"The customer cannot afford this cart.");
  // The settlement routine emits reserved receipts, updates the customer,
  // and transfers the gold. Preserve all other outstanding carts.
  // The bonus is a real customer-funded tip, not minted shop gold.
  // For tiny carts, round down to whole gold. Never overdraw the hero.
  const tip=!employeeName&&perfectTiming&&hero.gold>=total+Math.floor(total/10)
    ? Math.floor(total/10):0;
  const isolated={...state,shopCarts:[cart]};
  const settled=settleHeldShopCarts(isolated,state.day);
  // Manual receipts need their own stable identity. Legacy/End Day receipts
  // may already exist for this hero and shelf on the same day.
  const visit=shopVisitSuffix(state.events,state.day,heroId);
  const events=settled.events.map(event=>({...event,
    id:event.id+":manual"+visit,saleChannel:"manual" as const,
    message:employeeName?event.message+" Served by "+employeeName+".":event.message}));
  if(events.some(event=>state.events.some(prior=>prior.id===event.id)))
    return failed(state,"This customer already paid for this shelf during this visit.");
  const tipEvent:WorldEvent|null=tip>0?{
    id:"day-"+state.day+":"+heroId+":tip"+visit,type:"tip",day:state.day,
    adventurerId:heroId,revenue:tip,
    message:hero.name+" tipped "+tip+"g for excellent service.",
  }:null;
  if(tipEvent&&state.events.some(event=>event.id===tipEvent.id))
    return failed(state,"This customer has already tipped during this visit.");
  const paid=settled.state;
  const balance=paid.shopEconomy.balance+tip;
  const revenue=paid.shopEconomy.dailySales.revenue+tip;
  if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(revenue))
    return failed(state,"This checkout exceeds safe economy limits.");
  return {
    state:{...paid,
      adventurers:tip>0?paid.adventurers.map(person=>person.id===heroId
        ? {...person,gold:person.gold-tip}:person):paid.adventurers,
      shopEconomy:tip>0?{...paid.shopEconomy,
        balance,
        dailySales:{...paid.shopEconomy.dailySales,
          revenue}}:paid.shopEconomy,
      shopCarts:state.shopCarts.filter(entry=>entry.heroId!==heroId),
      events:[...state.events,...events,...(tipEvent?[tipEvent]:[])]},
    message:hero.name+" paid "+total+"g"+(tip?" + "+tip+"g tip":"")+
      " for "+cart.lines.length+" line(s).",
  };
}
