import { advanceDay, createGameState, setLevel6Permit, type GameState } from "./gameState.ts";
import { buyWholesale, discardBag, transferShelf, type ItemId } from "./economy.ts";
import { replaceShelfPlacement, type ShelfPlacement } from "./shopLayout.ts";
import { checkoutCustomer, quoteCustomerCheckout, type CheckoutQuote } from "./customerCheckout.ts";
import { pickUpShopItem, returnShopCart, payReservedShopCart } from "./shopCarts.ts";

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

  restore(state: GameState): void {
    this.purchases.clear();
    this.replace(state);
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

  discard(itemId: ItemId, requestId: number): string {
    if (this.purchases.has(requestId)) return "This order was already processed.";
    this.purchases.add(requestId);
    const result = discardBag(this.current, itemId);
    this.replace(result.state);
    return result.message;
  }

  placeShelf(placement: ShelfPlacement): string {
    const result = replaceShelfPlacement(this.current.shopLayout, placement);
    if (result.layout !== this.current.shopLayout)
      this.replace({ ...this.current, shopLayout: result.layout });
    return result.message;
  }

  pickUpShopItem(heroId: string, slotId: string): string {
    const result = pickUpShopItem(this.current, heroId, slotId);
    this.replace(result.state);
    return result.message;
  }

  returnShopCart(heroId: string): string {
    const result = returnShopCart(this.current, heroId);
    this.replace(result.state);
    return result.message;
  }

  payReservedCart(heroId:string):string {
    const result=payReservedShopCart(this.current,heroId);
    this.replace(result.state);
    return result.message;
  }

  quoteCheckout(heroId: string): CheckoutQuote | null {
    return quoteCustomerCheckout(this.current, heroId);
  }

  /** The only commit point for the future staffed-register UI. */
  checkout(quote: CheckoutQuote): string {
    const result = checkoutCustomer(this.current, quote);
    this.replace(result.state);
    return result.message;
  }

  setLevel6Permit(heroId: string, permitted: boolean): boolean {
    const result = setLevel6Permit(this.current, heroId, permitted);
    if (result === this.current) return false;
    this.replace(result);
    return true;
  }

  endDay(): void {
    this.replace(advanceDay(this.current).state);
  }
}
