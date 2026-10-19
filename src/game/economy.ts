import type { AdventurerState } from "./adventurers.ts";
import type { GameState, ShopEconomyState, WorldEvent } from "./gameState.ts";

export const ITEMS = [
  { id: "healing-herb", name: "Healing Herb", color: "#64a84b", wholesaleCost: 3, salePrice: 6, kind: "healing", healing: 18, hunger: 0 },
  { id: "mana-potion", name: "Mana Potion", color: "#548bd2", wholesaleCost: 4, salePrice: 7, kind: "supply", healing: 0, hunger: 0 },
  { id: "iron-ore", name: "Iron Ore", color: "#9a9289", wholesaleCost: 2, salePrice: 3, kind: "material", healing: 0, hunger: 0 },
  { id: "bread", name: "Waybread", color: "#c79246", wholesaleCost: 2, salePrice: 4, kind: "food", healing: 0, hunger: 3 },
] as const;

export type ItemId = (typeof ITEMS)[number]["id"];
export type ItemDefinition = (typeof ITEMS)[number];

export interface Slot {
  id: string;
  shelfId: string;
  index: number;
  itemId: ItemId | null;
  quantity: number;
  capacity: number;
}

export const ECONOMY = {
  bagCapacity: 24,
  slotCapacity: 5,
  startingGold: 20,
  foodTarget: 2,
  healingTarget: 1,
  starvationThreshold: 3,
  starvationDamage: 8,
  rescueQuantity: 2,
} as const;

export function createEconomy(): ShopEconomyState {
  const slots: Slot[] = [];
  for (let shelf = 1; shelf <= 2; shelf += 1) {
    for (let index = 0; index < 5; index += 1) {
      slots.push({
        id: `shelf-${shelf}-slot-${index + 1}`, shelfId: `shelf-${shelf}`, index,
        itemId: shelf === 1 && index === 1 ? "bread" : shelf === 1 && index === 2 ? "healing-herb" : null,
        quantity: shelf === 1 && index === 1 ? 3 : shelf === 1 && index === 2 ? 2 : 0,
        capacity: ECONOMY.slotCapacity,
      });
    }
  }
  return {
    balance: ECONOMY.startingGold,
    bag: { "healing-herb": 5, "mana-potion": 3, "iron-ore": 4, bread: 2 },
    slots,
    dailySales: { day: 1, units: 0, revenue: 0 },
    lastRescueDay: null,
  };
}

function bagTotal(economy: ShopEconomyState): number {
  return Object.values(economy.bag).reduce((sum, quantity) => sum + quantity, 0);
}

export function buyWholesale(state: GameState, itemId: ItemId, quantity: number): { state: GameState; message: string } {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (!item || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return { state, message: "Choose a valid item and a positive whole quantity." };
  }
  const economy = state.shopEconomy;
  const cost = item.wholesaleCost * quantity;
  if (!Number.isSafeInteger(cost) || cost > economy.balance) return { state, message: "Not enough gold." };
  if (bagTotal(economy) + quantity > ECONOMY.bagCapacity) return { state, message: "Your inventory is full." };
  return {
    state: { ...state, shopEconomy: {
      ...economy, balance: economy.balance - cost,
      bag: { ...economy.bag, [itemId]: economy.bag[itemId] + quantity },
    } },
    message: `Bought ${quantity} ${item.name} for ${cost} gold.`,
  };
}

export function discardBag(state: GameState, itemId: ItemId): { state: GameState; message: string } {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (!item) return { state, message: "Choose a valid item." };
  const economy = state.shopEconomy;
  if (economy.bag[itemId] < 1) return { state, message: "You're out of the selected item." };
  return {
    state: {
      ...state,
      shopEconomy: { ...economy, bag: { ...economy.bag, [itemId]: economy.bag[itemId] - 1 } },
    },
    message: `Discarded ${item.name}. No gold refunded.`,
  };
}

export function transferShelf(
  state: GameState, slotId: string, itemId: ItemId, direction: "stock" | "remove",
): { state: GameState; message: string } {
  const item = ITEMS.find((entry) => entry.id === itemId);
  const economy = state.shopEconomy;
  const slot = economy.slots.find((entry) => entry.id === slotId);
  if (!item || !slot || (direction !== "stock" && direction !== "remove")) {
    return { state, message: "Choose a valid item, slot and transfer direction." };
  }
  if (direction === "stock") {
    if (economy.bag[itemId] < 1) return { state, message: "You're out of the selected item." };
    if ((slot.itemId !== null && slot.itemId !== itemId) || slot.quantity >= slot.capacity) {
      return { state, message: "That slot is full or holds a different item." };
    }
  } else {
    if (slot.itemId !== itemId || slot.quantity < 1) return { state, message: "That slot is empty or holds a different item." };
    if (bagTotal(economy) >= ECONOMY.bagCapacity) return { state, message: "Your inventory is full." };
  }
  const delta = direction === "stock" ? 1 : -1;
  const quantity = slot.quantity + delta;
  return {
    state: { ...state, shopEconomy: {
      ...economy,
      bag: { ...economy.bag, [itemId]: economy.bag[itemId] - delta },
      slots: economy.slots.map((entry) => entry === slot ? { ...entry, quantity, itemId: quantity ? itemId : null } : entry),
    } },
    message: direction === "stock" ? `Placed ${item.name}.` : `Returned ${item.name} to your inventory.`,
  };
}

export function tradeAtStartOfDay(state: GameState, day: number): {
  economy: ShopEconomyState; adventurers: readonly AdventurerState[]; events: WorldEvent[];
} {
  const events: WorldEvent[] = [];
  let economy: ShopEconomyState = {
    ...state.shopEconomy,
    slots: state.shopEconomy.slots.map((slot) => ({ ...slot })),
    dailySales: { day, units: 0, revenue: 0 },
  };
  const bread = ITEMS.find((item) => item.id === "bread")!;
  // Emergency aid is bounded, bag-only, and available only once on a bankrupt, foodless day.
  if (economy.balance < bread.wholesaleCost && economy.bag.bread === 0 &&
      !economy.slots.some((slot) => slot.itemId === "bread" && slot.quantity > 0) &&
      economy.lastRescueDay !== day) {
    const quantity = Math.min(ECONOMY.rescueQuantity, ECONOMY.bagCapacity - bagTotal(economy));
    if (quantity > 0) {
      economy = { ...economy, bag: { ...economy.bag, bread: quantity }, lastRescueDay: day };
      events.push({
        id: `day-${day}:rescue`, type: "rescue", day, itemId: "bread", quantity,
        message: `Emergency aid: ${quantity} Waybread added to the bag.`,
      });
    }
  }
  // Array order breaks ties. Only customers already here may buy; new arrivals wait until tomorrow.
  const adventurers = state.adventurers.map((hero) => {
    if (hero.status !== "at-shop" || hero.health <= 0) return hero;
    let gold = hero.gold;
    let food = hero.inventory.food;
    let healing = hero.inventory.healing;
    for (const slot of economy.slots) {
      const item = ITEMS.find((entry) => entry.id === slot.itemId);
      if (!item || slot.quantity < 1) continue;
      const need = item.kind === "food" ? Math.max(0, ECONOMY.foodTarget - food)
        : item.kind === "healing" && hero.health < hero.stats.maxHealth
          ? Math.max(0, ECONOMY.healingTarget - healing) : 0;
      const quantity = Math.min(need, slot.quantity, Math.floor(gold / item.salePrice));
      if (quantity <= 0) continue;
      const revenue = quantity * item.salePrice;
      gold -= revenue;
      if (item.kind === "food") food += quantity;
      if (item.kind === "healing") healing += quantity;
      slot.quantity -= quantity;
      if (slot.quantity === 0) slot.itemId = null;
      economy = {
        ...economy, balance: economy.balance + revenue,
        dailySales: { day, units: economy.dailySales.units + quantity, revenue: economy.dailySales.revenue + revenue },
      };
      events.push({
        id: `day-${day}:${hero.id}:sale:${slot.id}`, type: "sale", day, adventurerId: hero.id,
        itemId: item.id, quantity, revenue,
        message: `${hero.name} bought ${quantity} ${item.name} for ${revenue} gold.`,
      });
    }
    return gold === hero.gold ? hero : {
      ...hero, gold, inventory: { ...hero.inventory, food, healing },
    };
  });
  return { economy, adventurers, events };
}
