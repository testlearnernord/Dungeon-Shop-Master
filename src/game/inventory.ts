export const ITEMS = [
  { id: "healing-herb", name: "Healing Herb", color: "#64a84b" },
  { id: "mana-potion", name: "Mana Potion", color: "#548bd2" },
  { id: "iron-ore", name: "Iron Ore", color: "#9a9289" },
  { id: "bread", name: "Waybread", color: "#c79246" },
] as const;

export type ItemId = (typeof ITEMS)[number]["id"];
export type ItemDefinition = (typeof ITEMS)[number];

export interface InventoryStack {
  itemId: ItemId;
  quantity: number;
}

export interface Slot {
  id: string;
  shelfId: string;
  index: number;
  itemId: ItemId | null;
  quantity: number;
  capacity: number;
}

export interface Interactable {
  id: string;
  kind: "shelf-slot" | "register" | "corridor";
}

export class Inventory {
  readonly capacity = 24;
  private readonly quantities = new Map<ItemId, number>(
    ITEMS.map((item) => [item.id, 0]),
  );

  constructor() {
    this.quantities.set("healing-herb", 5);
    this.quantities.set("mana-potion", 3);
    this.quantities.set("iron-ore", 4);
    this.quantities.set("bread", 2);
  }

  get total(): number {
    return [...this.quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
  }

  count(itemId: ItemId): number {
    return this.quantities.get(itemId) ?? 0;
  }

  add(itemId: ItemId, amount = 1): boolean {
    if (!Number.isInteger(amount) || amount <= 0 || this.total + amount > this.capacity) {
      return false;
    }
    this.quantities.set(itemId, this.count(itemId) + amount);
    return true;
  }

  remove(itemId: ItemId, amount = 1): boolean {
    const current = this.count(itemId);
    if (!Number.isInteger(amount) || amount <= 0 || current < amount) {
      return false;
    }
    this.quantities.set(itemId, current - amount);
    return true;
  }

  stacks(): InventoryStack[] {
    return ITEMS.map(({ id }) => ({ itemId: id, quantity: this.count(id) }));
  }
}
