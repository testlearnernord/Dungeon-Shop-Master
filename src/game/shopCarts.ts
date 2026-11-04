import { ITEMS, type ItemId } from "./economy.ts";
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
  return state.events.some(event => event.type === "sale" &&
    event.saleChannel === "manual" &&
    event.day === state.day && event.adventurerId === heroId);
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
          ? { ...entry, quantity: remaining,
            itemId: remaining === 0 ? null : entry.itemId }
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

/**
 * Interim bridge until the interactive cashier is available.
 * The reserved cart is settled exactly once when End Day is confirmed.
 * Its sale events use the new day so receipts retain chronological order and
 * the existing strict save/event schemas accept them unchanged.
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

    let food = hero.inventory.food;
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
      if (item.kind === "food") food += line.quantity;
      else if (item.kind === "healing") healing += line.quantity;
      else if (item.kind === "weapon") weapon = item.name;
      else if (item.kind === "armor") armor = item.name;
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
          inventory: {...person.inventory,food,healing},
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
