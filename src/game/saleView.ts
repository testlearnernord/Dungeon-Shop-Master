import { ITEMS, type ItemId } from "./economy.ts";
import type { GameState, WorldEvent } from "./gameState.ts";

export interface SaleReceipt {
  readonly id: string;
  readonly day: number;
  readonly heroId: string;
  readonly heroName: string;
  readonly itemId: ItemId;
  readonly itemName: string;
  readonly quantity: number;
  readonly revenue: number;
}

/** Derive receipts from saved, authoritative transaction events, never from NPC animations. */
export function currentDayReceipts(state: GameState): readonly SaleReceipt[] {
  const names = new Map(state.adventurers.map((hero) => [hero.id, hero.name]));
  const result: SaleReceipt[] = [];
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event: WorldEvent = state.events[index];
    if (event.day < state.day) break;
    if (event.day !== state.day || event.type !== "sale" ||
      !event.adventurerId || !event.itemId || event.quantity === undefined || event.revenue === undefined) continue;
    const item = ITEMS.find((entry) => entry.id === event.itemId);
    if (!item) continue;
    result.push({
      id: event.id, day: event.day, heroId: event.adventurerId,
      heroName: names.get(event.adventurerId) ?? event.adventurerId,
      itemId: item.id, itemName: item.name,
      quantity: event.quantity, revenue: event.revenue,
    });
  }
  return result.reverse();
}

export function salesByHero(receipts: readonly SaleReceipt[]): ReadonlyMap<string, { readonly units: number; readonly gold: number }> {
  const totals = new Map<string, { units: number; gold: number }>();
  for (const receipt of receipts) {
    const previous = totals.get(receipt.heroId);
    totals.set(receipt.heroId, {
      units: (previous?.units ?? 0) + receipt.quantity,
      gold: (previous?.gold ?? 0) + receipt.revenue,
    });
  }
  return totals;
}
