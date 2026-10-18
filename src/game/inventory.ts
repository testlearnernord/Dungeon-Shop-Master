export { ITEMS, type ItemId, type Slot } from "./economy.ts";
import type { ItemId } from "./economy.ts";

export interface InventoryStack {
  itemId: ItemId;
  quantity: number;
}

export interface Interactable {
  id: string;
  kind: "shelf-slot" | "register" | "corridor";
}
