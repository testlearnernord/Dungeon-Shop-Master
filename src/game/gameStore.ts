import { createLevel5Room, excavateLevel5Cell, isValidLevel5Room, type RoomCell } from "./level5Room.ts";
import { advanceDay, createGameState, setLevel6Permit, type GameState } from "./gameState.ts";
import { buyWholesale, discardBag, transferShelf, type ItemId } from "./economy.ts";
import { replaceCounterPlacement, replaceShelfPlacement, type CounterPlacement, type ShelfPlacement } from "./shopLayout.ts";
import { checkoutCustomer, quoteCustomerCheckout, type CheckoutQuote } from "./customerCheckout.ts";
import { pickUpShopItem, returnShopCart, payReservedShopCart } from "./shopCarts.ts";
import { walkOutWithoutPurchase } from "./shopWalkout.ts";
import { issueShopCredit, quoteBeggingRequest } from "./shopCredit.ts";
import { shopServiceReachabilityProblem } from "./shopServiceReachability.ts";
import type { ShoppingReason } from "./shopperIntents.ts";

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

  /** Commits only validated excavation; geometry updates subscribe to state. */
  excavateShopCell(cell:RoomCell):string {
    const room=this.current.level5Room??createLevel5Room();
    const result=excavateLevel5Cell(room,cell);
    if(!result.ok)return result.reason;
    this.replace({...this.current,level5Room:result.room});
    return "Rock excavated.";
  }

  unlockShopExpansion(tier:number):string {
    const room=this.current.level5Room??createLevel5Room();
    if(!Number.isSafeInteger(tier)||tier!==room.expansionTier+1||tier>3)
      return "Invalid expansion tier.";
    const next={...room,expansionTier:tier};
    if(!isValidLevel5Room(next))return "Invalid room geometry.";
    this.replace({...this.current,level5Room:next});
    return "Shop expansion unlocked.";
  }

  placeShelf(placement: ShelfPlacement): string {
    const result = replaceShelfPlacement(this.current.shopLayout, placement);
    if (result.layout !== this.current.shopLayout) {
      const invalid=shopServiceReachabilityProblem(result.layout,this.current.level5Room);
      if(invalid)return invalid;
      this.replace({ ...this.current, shopLayout: result.layout });
    }
    return result.message;
  }

  placeCounter(placement:CounterPlacement):string {
    const result=replaceCounterPlacement(this.current.shopLayout,placement);
    if(result.layout!==this.current.shopLayout){
      const invalid=shopServiceReachabilityProblem(result.layout);
      if(invalid)return invalid;
      this.replace({...this.current,shopLayout:result.layout});
    }
    return result.message;
  }

  pickUpShopItem(heroId: string, slotId: string): string {
    const result = pickUpShopItem(this.current, heroId, slotId);
    this.replace(result.state);
    return result.message;
  }

  quoteBeggingRequest(heroId:string) {
    return quoteBeggingRequest(this.current,heroId);
  }

  /** Goods are handed over now, at full sticker price as a debt, not income. */
  issueShopCredit(heroId:string):string {
    const result=issueShopCredit(this.current,heroId);
    this.replace(result.state);
    return result.message;
  }

  walkOutWithoutPurchase(heroId:string,reason:ShoppingReason):void {
    this.replace(walkOutWithoutPurchase(this.current,heroId,reason));
  }

  returnShopCart(heroId: string): string {
    const result = returnShopCart(this.current, heroId);
    this.replace(result.state);
    return result.message;
  }

  payReservedCart(heroId:string,perfectTiming=false):string {
    const result=payReservedShopCart(this.current,heroId,perfectTiming);
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
