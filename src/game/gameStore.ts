import { excavateLevel5Cell, isValidLevel5Room, type RoomCell } from "./level5Room.ts";
import { advanceDay, createGameState, setLevel6Permit, type GameState } from "./gameState.ts";
import { buyWholesale, discardBag, transferShelf, type ItemId } from "./economy.ts";
import type {FurnitureDraft} from "./furnitureBlueprint.ts";
import {resolveFurniturePlacement} from "./furniturePlacement.ts";
import { checkoutCustomer, quoteCustomerCheckout, type CheckoutQuote } from "./customerCheckout.ts";
import { pickUpShopItem, returnShopCart, payReservedShopCart } from "./shopCarts.ts";
import { walkOutWithoutPurchase } from "./shopWalkout.ts";
import { issueShopCredit, quoteBeggingRequest } from "./shopCredit.ts";
import type { ShoppingReason } from "./shopperIntents.ts";
import {rosterBoardProblem} from "./rosterBoardPlacement.ts";
import {wallPortraitProblem} from "./wallPortraitPlacement.ts";

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

  excavateShopCell(cell:RoomCell):string {
    const room=this.current.level5Room;
    const result=excavateLevel5Cell(room,cell);
    if(!result.ok)return result.reason;
    // The mineable rock is also a possible *wall mount*. Excavating its
    // supporting stone must not strand a saved board in midair.
    const board=this.current.rosterBoard;
    if(rosterBoardProblem(board,this.current.shopLayout,result.room))
      return "Move the Adventurer Board before mining its supporting rock.";
    if(this.current.wallPortrait&&wallPortraitProblem(this.current.wallPortrait,
      this.current.shopLayout,result.room,board))
      return "Move Galvik's portrait before mining its supporting rock.";
    this.replace({...this.current,level5Room:result.room});
    return "Rock excavated.";
  }

  unlockShopExpansion(tier:number):string {
    const room=this.current.level5Room;
    if(!Number.isSafeInteger(tier)||tier!==room.expansionTier+1||tier>3)
      return "Invalid expansion tier.";
    const next={...room,expansionTier:tier};
    if(!isValidLevel5Room(next))return "Invalid room geometry.";
    this.replace({...this.current,level5Room:next});
    return "Shop expansion unlocked.";
  }

  /** One authoritative placement path for the shelf, till, bedroom and
   * wall board. Both editors and the preview ask exactly this pure validator.
   */
  previewFurniturePlacement(draft:FurnitureDraft):string|null{
    return resolveFurniturePlacement(this.current,draft).problem;
  }
  placeFurniture(draft:FurnitureDraft):string{
    const result=resolveFurniturePlacement(this.current,draft);
    if(result.problem)return result.problem;
    this.replace(result.state);
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
