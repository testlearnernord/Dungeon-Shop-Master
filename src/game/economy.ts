import type { AdventurerState } from "./adventurers.ts";
import type { GameState, ShopEconomyState, WorldEvent } from "./gameState.ts";

export const ITEMS = [
  { id: "healing-herb", name: "Healing Herb", color: "#64a84b", wholesaleCost: 3, salePrice: 6, kind: "healing", healing: 18 },
  { id: "mana-potion", name: "Mana Potion", color: "#548bd2", wholesaleCost: 4, salePrice: 7, kind: "supply", healing: 0 },
  { id: "iron-ore", name: "Iron Ore", color: "#9a9289", wholesaleCost: 2, salePrice: 3, kind: "material", healing: 0 },
  { id: "bread", name: "Waybread", color: "#c79246", wholesaleCost: 2, salePrice: 4, kind: "healing", healing: 8 },
  { id: "iron-sword", name: "Iron Sword", color: "#a4b4c3", wholesaleCost: 5, salePrice: 9, kind: "weapon", healing: 0 },
  { id: "leather-vest", name: "Leather Vest", color: "#805338", wholesaleCost: 5, salePrice: 8, kind: "armor", healing: 0 },
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
  breadCarryLimit: 2,
  herbCarryLimit: 1,
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
    bag: { "healing-herb": 5, "mana-potion": 3, "iron-ore": 4, bread: 2,
      "iron-sword": 0, "leather-vest": 0 },
    slots,
    dailySales: { day: 1, units: 0, revenue: 0 },
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
  // Stock already carried in an unpaid cart is allocated to that original
  // slot. Do not reuse it for a different product or overflow on return.
  if (state.shopCarts.some(cart => cart.lines.some(line =>
    line.slotId === slotId)))
    return {state, message: "This shelf slot contains items held by customers."};
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
    dailySales: state.shopEconomy.dailySales.day === day
      ? {...state.shopEconomy.dailySales}
      : { day, units: 0, revenue: 0 },
  };
  // Array order breaks ties. Only customers already here may buy; new arrivals wait until tomorrow.
  const adventurers = state.adventurers.map((hero) => {
    if (hero.status !== "at-shop" || hero.health <= 0) return hero;
    let gold = hero.gold;
    let bread = hero.inventory.bread;
    let healing = hero.inventory.healing;
    let weapon = hero.equipment.weapon;
    let armor = hero.equipment.armor;
    // Even unwounded visitors can buy a small emergency reserve for their
    // next expedition. Only actual HP loss consumes it.
    // Major wounds favor the +18 herb; small cuts favor cheap +8 bread.
    const missing = hero.stats.maxHealth - hero.health;
    const priority = (slot: Slot): number => {
      const id = slot.itemId;
      if (id === (missing <= 8 ? "bread" : "healing-herb")) return 0;
      if (id === (missing <= 8 ? "healing-herb" : "bread")) return 1;
      const kind = ITEMS.find(item => item.id === id)?.kind;
      return kind === "weapon" || kind === "armor" ? 2 : 3;
    };
    const prioritized = [...economy.slots].sort((a,b) => priority(a)-priority(b));
    for (const slot of prioritized) {
      const item = ITEMS.find((entry) => entry.id === slot.itemId);
      if (!item || slot.quantity < 1) continue;
      const uncovered = Math.max(0, Math.max(8, missing) - bread * 8 - healing * 18);
      const need = item.id === "bread"
        ? Math.min(ECONOMY.breadCarryLimit - bread, Math.ceil(uncovered / 8))
        : item.id === "healing-herb"
          ? Math.min(ECONOMY.herbCarryLimit - healing, Math.ceil(uncovered / 18))
          : item.kind === "weapon" && weapon === null ? 1
          : item.kind === "armor" && armor === null ? 1 : 0;
      const quantity = Math.min(need, slot.quantity, Math.floor(gold / item.salePrice));
      if (quantity <= 0) continue;
      const revenue = quantity * item.salePrice;
      gold -= revenue;
      if (item.id === "bread") bread += quantity;
      if (item.id === "healing-herb") healing += quantity;
      if (item.kind === "weapon") weapon = item.name;
      if (item.kind === "armor") armor = item.name;
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
      ...hero, gold, inventory: { ...hero.inventory, bread, healing },
      equipment: { ...hero.equipment, weapon, armor },
    };
  });
  return { economy, adventurers, events };
}
