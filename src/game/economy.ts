import type { AdventurerState } from "./adventurers.ts";
import { HEALING_HERB_HP, WAYBREAD_HP } from "./combatVitality.ts";
import {heroProgression} from "./heroProgression.ts";
import {SHELF_SLOT_COUNT} from "./furnitureRegistry.ts";
import {gearForItem,needsGearUpgrade} from "./gearCatalog.ts";
import type { GameState, ShopEconomyState, WorldEvent } from "./gameState.ts";

export const ITEMS = [
  { id: "healing-herb", name: "Healing Herb", color: "#64a84b", wholesaleCost: 3, salePrice: 6, kind: "healing", healing: HEALING_HERB_HP },
  { id: "mana-potion", name: "Mana Potion", color: "#548bd2", wholesaleCost: 4, salePrice: 7, kind: "supply", healing: 0 },
  { id: "iron-ore", name: "Iron Ore", color: "#9a9289", wholesaleCost: 2, salePrice: 3, kind: "material", healing: 0 },
  { id: "coal", name: "Coal", color: "#444950", wholesaleCost: 2, salePrice: 3, kind: "material", healing: 0 },
  { id: "ghoul-leather", name: "Ghoul Leather", color: "#6c7453", wholesaleCost: 4, salePrice: 6, kind: "material", healing: 0 },
  { id: "bread", name: "Waybread", color: "#c79246", wholesaleCost: 2, salePrice: 4, kind: "healing", healing: WAYBREAD_HP },
  { id: "iron-sword", name: "T1 Sword & Shield", color: "#a4b4c3", wholesaleCost: 5, salePrice: 9, kind: "weapon", healing: 0 },
  { id: "spear", name: "T1 Spear", color: "#b9afa4", wholesaleCost: 5, salePrice: 9, kind: "weapon", healing: 0 },
  { id: "staff", name: "T1 Staff", color: "#8374bc", wholesaleCost: 5, salePrice: 9, kind: "weapon", healing: 0 },
  { id: "leather-vest", name: "T1 Leather Vest", color: "#805338", wholesaleCost: 5, salePrice: 8, kind: "armor", healing: 0 },
  { id: "forged-sword-shield", name: "T2 Sword & Shield", color: "#d0b36c", wholesaleCost: 0, salePrice: 26, kind: "weapon", healing: 0 },
  { id: "forged-spear", name: "T2 Spear", color: "#d0b36c", wholesaleCost: 0, salePrice: 25, kind: "weapon", healing: 0 },
  { id: "forged-staff", name: "T2 Staff", color: "#a98fe0", wholesaleCost: 0, salePrice: 25, kind: "weapon", healing: 0 },
  { id: "ghoul-leather-vest", name: "T2 Ghoul Leather Vest", color: "#647d61", wholesaleCost: 0, salePrice: 23, kind: "armor", healing: 0 },
] as const;

export type ItemId = (typeof ITEMS)[number]["id"];
/** Only real shop merchandise requires physical GLB models. Raw materials
 * are bought directly from adventurers and are never shelf displays. */
export const SHELF_GOODS = ITEMS.filter(item=>item.kind!=="material");
export const WHOLESALE_GOODS = ITEMS.filter(item=>
  item.kind!=="material"&&item.wholesaleCost>0);
export const isWholesaleGood=(id:ItemId):boolean=>
  WHOLESALE_GOODS.some(item=>item.id===id);
export const isShelfGood=(id:ItemId):boolean=>SHELF_GOODS.some(item=>item.id===id);
export type ItemDefinition = (typeof ITEMS)[number];
export type MaterialItemId=Extract<ItemDefinition,{kind:"material"}>["id"];
export const MATERIAL_ITEMS=ITEMS.filter(item=>item.kind==="material");
export const isMaterial=(id:ItemId):id is MaterialItemId=>
  MATERIAL_ITEMS.some(item=>item.id===id);

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
  breadTarget: 2,
  healingTarget: 1,
} as const;

/** One shared real purchasing preference for physical customers, quote
 * forecasting, and restock petitions. Injured heroes without supplies
 * prioritize survival. Healthy heroes buy class-relevant permanent gear
 * before spending the same money on an extra loaf of bread.
 *
 * A preference does NOT grant an item, reserve a shelf or make a sale.
 * Mana Potions intentionally remain excluded until they have a real use. */
export function preferredShopItemOrder(
  hero:Pick<AdventurerState,"role"|"level"|"stats"|"health"|"inventory"|"equipment">,
):readonly ItemId[]{
  const weapon:readonly ItemId[]=hero.role==="tank"
    ?["forged-sword-shield","iron-sword"]:
    hero.role==="DPS" ?["forged-spear","spear"]:
    ["forged-staff","staff"];
  const equipment:readonly ItemId[]=[
    ...weapon,"ghoul-leather-vest","leather-vest"];
  const supply:readonly ItemId[]=["healing-herb","bread"];
  const healthRatio=hero.health/heroProgression(hero).maxHealth;
  const urgent=healthRatio<0.60||
    (healthRatio<0.80&&hero.inventory.healing===0&&hero.inventory.bread===0);
  return urgent?[...supply,...equipment]:
    [...equipment,"bread","healing-herb"];
}

/** Instance-owned slots: stable identities, real goods and cart references.
 * Newly built shelving is EMPTY, never a source of free merchandise.
 */
export function createEmptyShelfSlots(shelfId:string):Slot[]{
  return Array.from({length:SHELF_SLOT_COUNT},(_,index)=>({
    id:`${shelfId}-slot-${index+1}`,shelfId,index,
    itemId:null,quantity:0,capacity:ECONOMY.slotCapacity,
  }));
}

export function createEconomy(): ShopEconomyState {
  return {
    balance: ECONOMY.startingGold,
    bag:Object.fromEntries(ITEMS.map(item=>
      [item.id,item.id==="healing-herb"?5:
        item.id==="mana-potion"?3:item.id==="bread"?2:0])) as Record<ItemId,number>,
    materialStorage:{"iron-ore":0,coal:0,"ghoul-leather":0},
    // Merchandising begins only after the player builds a real shelf.
    slots:[],
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
  if (!isWholesaleGood(itemId))
    return {state,message:"Only T1 merchandise and supplies can be ordered wholesale. T2 must be forged."};
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
  if(isMaterial(itemId))return {state,message:"Raw materials are held in the workshop reserve, not the shop bag."};
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
  requestedUnits = 1,
): { state: GameState; message: string } {
  const item = ITEMS.find((entry) => entry.id === itemId);
  const economy = state.shopEconomy;
  const slot = economy.slots.find((entry) => entry.id === slotId);
  // Stock already carried in an unpaid cart is allocated to that original
  // slot. Do not reuse it for a different product or overflow on return.
  if (state.shopCarts.some(cart => cart.lines.some(line =>
    line.slotId === slotId)))
    return {state, message: "This shelf slot contains items held by customers."};
  if (item&&!isShelfGood(item.id))
    return {state,message:"Raw materials cannot be placed on shop shelves."};
  if (!item || !slot || (direction !== "stock" && direction !== "remove") ||
      !Number.isSafeInteger(requestedUnits) || requestedUnits < 1) {
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
  // One validated transaction for both single clicks and Shift+click;
  // never make per-frame stock changes or a separate bulk inventory.
  const units = direction === "stock"
    ? Math.min(requestedUnits, economy.bag[itemId], slot.capacity - slot.quantity)
    : Math.min(requestedUnits, slot.quantity, ECONOMY.bagCapacity - bagTotal(economy));
  const delta = direction === "stock" ? units : -units;
  const quantity = slot.quantity + delta;
  return {
    state: { ...state, shopEconomy: {
      ...economy,
      bag: { ...economy.bag, [itemId]: economy.bag[itemId] - delta },
      slots: economy.slots.map((entry) => entry === slot ? { ...entry, quantity, itemId: quantity ? itemId : null } : entry),
    } },
    message: direction === "stock"
      ? units === 1 ? `Placed ${item.name}.` : `Placed ${units} ${item.name}.`
      : units === 1 ? `Returned ${item.name} to your inventory.`
        : `Returned ${units} ${item.name} to your inventory.`,
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
    // Sort the physical slots by THIS hero's condition and class.
    // The original slot order remains the stable tie-breaker. Forecasts
    // and the real cashier both read these exact same priorities.
    const preferences=preferredShopItemOrder(hero);
    const rank=(id:ItemId|null):number=>{
      if(id===null)return preferences.length;
      const index=preferences.indexOf(id);
      return index<0?preferences.length:index;
    };
    const prioritized=[...economy.slots].sort((a,b)=>
      rank(a.itemId)-rank(b.itemId));
    for (const slot of prioritized) {
      const item = ITEMS.find((entry) => entry.id === slot.itemId);
      if (!item || slot.quantity < 1) continue;
      const need = item.id === "bread" ? Math.max(0, ECONOMY.breadTarget - bread)
        : item.id === "healing-herb"
          ? Math.max(0, ECONOMY.healingTarget - healing)
          : (item.kind==="weapon"||item.kind==="armor")&&
            needsGearUpgrade(hero.role,{weapon,armor},item.id)?1:0;
      const quantity = Math.min(need, slot.quantity, Math.floor(gold / item.salePrice));
      if (quantity <= 0) continue;
      const revenue = quantity * item.salePrice;
      gold -= revenue;
      if (item.id === "bread") bread += quantity;
      if (item.id === "healing-herb") healing += quantity;
      if (item.kind === "weapon") weapon = gearForItem(item.id)?.name??weapon;
      if (item.kind === "armor") armor = gearForItem(item.id)?.name??armor;
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
