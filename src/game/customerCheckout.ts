import { ITEMS } from "./economy.ts";
import { forecastShoppingIntents, type ShoppingInterest } from "./shopperIntents.ts";
import type { GameState, WorldEvent } from "./gameState.ts";

/**
 * Transaction boundary for the future staffed-register flow.
 *
 * A quote is only a forecast. No stock or gold is reserved here, and it is
 * safe to discard it. Checkout must revalidate the complete quote against
 * the latest authoritative GameState immediately before transferring value.
 */
export interface CheckoutQuote {
  readonly heroId: string;
  readonly day: number;
  readonly lines: readonly ShoppingInterest[];
  readonly total: number;
}

export interface CheckoutResult {
  readonly state: GameState;
  readonly events: readonly WorldEvent[];
  readonly message: string;
}

function paidToday(state: GameState, heroId: string): boolean {
  return state.events.some(event =>
    event.day === state.day && event.type === "sale" &&
    event.saleChannel === "manual" &&
    event.adventurerId === heroId);
}

export function quoteCustomerCheckout(
  state: GameState, heroId: string,
): CheckoutQuote | null {
  const hero = state.adventurers.find(person => person.id === heroId);
  if (!hero || hero.status !== "at-shop" || hero.health <= 0 ||
      paidToday(state, heroId) || state.shopCarts.some(cart =>
        cart.heroId === heroId)) return null;
  // Manual checkout is at most once per hero/day. Remove already-paid
  // customers from THIS projection so they cannot consume a competitor's
  // available stock. The automatic next-day trade algorithm is unchanged.
  const eligibleProjection: GameState = {
    ...state,
    adventurers: state.adventurers.map(person =>
      paidToday(state, person.id)
        ? { ...person, status: "returning", floor: 4, shopStayDays: 0 }
        : person),
  };
  const intent = forecastShoppingIntents(eligibleProjection).get(heroId);
  if (!intent || intent.items.length === 0) return null;
  return {
    heroId,
    day: state.day,
    lines: intent.items.map(line => ({ ...line })),
    total: intent.total,
  };
}

const unchanged = (state: GameState, message: string): CheckoutResult =>
  ({state,events:[],message});

/**
 * Exact-once, all-or-nothing purchase commit.
 *
 * - Checks a quote's complete contents, ordering, prices and hero/day.
 * - Consumes ONLY shelf stock, never the merchant's bag.
 * - Adjusts hero funds/gear/supplies, merchant balance and daily receipts
 *   in one immutable state transition.
 * - Uses the existing validated sale event format and stable IDs.
 * - Does not reroll the simulation or advance time.
 */
export function checkoutCustomer(
  state: GameState, quote: CheckoutQuote,
): CheckoutResult {
  if (!quote || typeof quote.heroId !== "string" || quote.day !== state.day)
    return unchanged(state, "The checkout quote is for another day.");
  if (paidToday(state, quote.heroId))
    return unchanged(state, "This customer already paid today.");

  const hero = state.adventurers.find(person => person.id === quote.heroId);
  if (!hero || hero.status !== "at-shop" || hero.health <= 0)
    return unchanged(state, "The customer is not available at the register.");

  const fresh = quoteCustomerCheckout(state, quote.heroId);
  if (!fresh || fresh.total !== quote.total ||
      JSON.stringify(fresh.lines) !== JSON.stringify(quote.lines))
    return unchanged(state, "The cart changed. Recheck the shelf, stock and prices.");
  if (!Number.isSafeInteger(quote.total) || quote.total <= 0 ||
      hero.gold < quote.total)
    return unchanged(state, "The customer cannot afford that cart.");

  let bread = hero.inventory.bread;
  let healing = hero.inventory.healing;
  let weapon = hero.equipment.weapon;
  let armor = hero.equipment.armor;
  const changes = new Map<string, number>();
  const events: WorldEvent[] = [];
  let units = 0;
  let revenue = 0;

  // Work only against a local allocation. Abort the entire transaction on
  // even one mismatch; never settle a partial cart and then charge the rest.
  for (const line of quote.lines) {
    const slot = state.shopEconomy.slots.find(entry => entry.id === line.slotId);
    const item = ITEMS.find(entry => entry.id === line.itemId);
    if (!slot || !item || slot.itemId !== item.id ||
        !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        slot.quantity - (changes.get(slot.id) ?? 0) < line.quantity ||
        line.subtotal !== line.quantity * item.salePrice)
      return unchanged(state, "The cart contains unavailable or invalid stock.");

    changes.set(slot.id,(changes.get(slot.id) ?? 0) + line.quantity);
    units += line.quantity;
    revenue += line.subtotal;
    if(item.id==="bread")bread+=line.quantity;
    else switch (item.kind) {
      case "healing": healing += line.quantity; break;
      case "weapon": weapon = item.name; break;
      case "armor": armor = item.name; break;
      default: return unchanged(state, "Unsupported item type at checkout.");
    }
    events.push({
      id: "day-" + state.day + ":" + hero.id + ":sale:" + slot.id,
      type: "sale",
      saleChannel: "manual",
      day: state.day,
      adventurerId: hero.id,
      itemId: item.id,
      quantity: line.quantity,
      revenue: line.subtotal,
      message: hero.name + " bought " + line.quantity + " " + item.name +
        " for " + line.subtotal + " gold.",
    });
  }

  if (revenue !== quote.total || !Number.isSafeInteger(revenue) ||
      !Number.isSafeInteger(state.shopEconomy.balance + revenue))
    return unchanged(state, "The cart has inconsistent totals.");

  const nextHero = {
    ...hero, gold: hero.gold - revenue,
    inventory: { ...hero.inventory, bread, healing },
    equipment: { ...hero.equipment, weapon, armor },
  };
  const nextSlots = state.shopEconomy.slots.map(slot => {
    const removed = changes.get(slot.id) ?? 0;
    if (!removed) return slot;
    const quantity = slot.quantity - removed;
    return { ...slot, quantity, itemId: quantity === 0 ? null : slot.itemId };
  });
  const nextState: GameState = {
    ...state,
    adventurers: state.adventurers.map(person =>
      person.id === hero.id ? nextHero : person),
    shopEconomy: {
      ...state.shopEconomy,
      balance: state.shopEconomy.balance + revenue,
      slots: nextSlots,
      dailySales: {
        day: state.day,
        units: state.shopEconomy.dailySales.units + units,
        revenue: state.shopEconomy.dailySales.revenue + revenue,
      },
    },
    events: [...state.events, ...events],
  };
  return {
    state: nextState, events,
    message: "Paid " + revenue + "g for " + units + " item" +
      (units === 1 ? "" : "s") + ".",
  };
}
