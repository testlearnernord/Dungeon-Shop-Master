import { advanceDay, createGameState, type GameState } from "./gameState.ts";
import { buyWholesale, transferShelf, type ItemId } from "./economy.ts";

export class GameStore {
  private current: GameState;
  private readonly listeners = new Set<() => void>();
  private readonly purchases = new Set<number>();

  constructor(state = createGameState()) {
    this.current = state;
  }

  get state(): GameState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private replace(state: GameState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of this.listeners) listener();
  }

  purchase(itemId: ItemId, quantity: number, requestId: number): string {
    if (this.purchases.has(requestId)) return "This order was already processed.";
    this.purchases.add(requestId);
    const result = buyWholesale(this.current, itemId, quantity);
    this.replace(result.state);
    return result.message;
  }

  transfer(slotId: string, itemId: ItemId, direction: "stock" | "remove"): string {
    const result = transferShelf(this.current, slotId, itemId, direction);
    this.replace(result.state);
    return result.message;
  }

  endDay(): void {
    this.replace(advanceDay(this.current).state);
  }
}
