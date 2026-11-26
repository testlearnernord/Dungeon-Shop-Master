import { excavateShopRoomCell, isValidShopRoomGeometry, type RoomCell } from "./shopRoomGeometry.ts";
import {isValidCellarRoom} from "./cellarRoom.ts";
import {isCellarPondUncovered,pondExcavationRemaining} from "./cellarPond.ts";
import { advanceDay, createGameState, type GameState } from "./gameState.ts";
import { buyWholesale, discardBag, transferShelf, type ItemId } from "./economy.ts";
import {buybackAtChest} from "./dungeonBuyback.ts";
import {craftAtCellarForge,type ForgeOutput} from "./cellarForge.ts";
import type {FurnitureDraft} from "./furnitureBlueprint.ts";
import {resolveFurniturePlacement} from "./furniturePlacement.ts";
import { pickUpShopItem, returnShopCart, payReservedShopCart } from "./shopCarts.ts";
import { walkOutWithoutPurchase } from "./shopWalkout.ts";
import { issueShopCredit, quoteBeggingRequest } from "./shopCredit.ts";
import type { ShoppingReason } from "./shopperIntents.ts";
import {validateShopTraffic,type ShopTrafficCheckpoint} from "./shopTraffic.ts";
import {rosterBoardProblem} from "./rosterBoardPlacement.ts";
import {wallPortraitProblem} from "./wallPortraitPlacement.ts";
import {wallClockProblem} from "./wallClockPlacement.ts";
import { advanceWorldUntil, lastWorldTickOfDay,
  WORLD_TICKS_PER_GAME_MINUTE } from "./worldClock.ts";
import {activateLiveDungeon,commitLiveWorldEvent,type DungeonDiagnosticSink} from "./liveDungeonRuntime.ts";
import {containsReplay,MAX_SAVED_REPLAYS} from "./replayRetention.ts";
import {completeObservedShopExit} from "./shopRotation.ts";
import {advanceEmployees,setEmployeePriority,type EmployeeTask} from "./employees.ts";
import {clearResolvedShopRequests,commitShopRequestEvent,closeShopRequests,
  requestRemainingTicks,shortenShopRequestForTest,startShopRequest} from "./shopRuntime.ts";

export class GameStore {
  private current: GameState;
  private readonly listeners = new Set<() => void>();
  private readonly purchases = new Set<number>();
  private liveDungeonRequested=false;

  private readonly dungeonDiagnostic?:DungeonDiagnosticSink;

  constructor(state = createGameState(),dungeonDiagnostic?:DungeonDiagnosticSink) {
    this.current = state;
    this.dungeonDiagnostic=dungeonDiagnostic;
  }

  get state(): GameState {
    return this.current;
  }
  /** Commit the one authoritative physical checkpoint; never alter stock or
   * create another customer AI/world clock in the persistence layer.
   */
  commitShopTraffic(checkpoint:ShopTrafficCheckpoint):void{
    validateShopTraffic(checkpoint,this.current.day,this.current.worldClock.tick,
      new Set(this.current.adventurers.filter(hero=>hero.status==="at-shop"||
         hero.status==="departing"||(!this.current.liveDungeon.enabled&&
         hero.status==="returning")).map(hero=>hero.id)),
      new Set(this.current.shopLayout.shelves.map(shelf=>shelf.id)));
    this.replace({...this.current,shopTraffic:checkpoint});
  }

  setEmployeePriority(id:string,task:EmployeeTask,priority:number):boolean{
    const next=setEmployeePriority(this.current,id,task,priority);
    if(next===this.current)return false;
    this.replace(next);return true;
  }

  /** Same committed physical-shop callback as the customer motor. */
  advancePhysicalEmployees():void{
    this.replace(advanceEmployees(this.current));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Public gameplay opts into one live expedition motor. Pure legacy
   * fixtures may still call advanceDay directly without invoking this.
   */
  enableLiveDungeon():void {
    this.liveDungeonRequested=true;
    this.replace(activateLiveDungeon(this.current));
  }
  restore(state: GameState): void {
    this.purchases.clear();
    this.replace(this.liveDungeonRequested?activateLiveDungeon(state):state);
  }

  private replace(state: GameState): void {
    if (state === this.current) return;
    // Pure shop request reconciliation after meaningful state changes only.
    // One clock tick must not re-run all shopping forecasts.
    const needsRefresh=state.adventurers!==this.current.adventurers||
      state.shopEconomy!==this.current.shopEconomy||
      state.shopCarts!==this.current.shopCarts||
      state.events!==this.current.events||state.shopDebts!==this.current.shopDebts;
    this.current=needsRefresh?clearResolvedShopRequests(state):state;
    for (const listener of this.listeners) listener();
  }

  /** The physical shop motor calls this only at the genuine outside gate. */
  completePhysicalShopExit(heroId:string,outerGateZ:number):boolean{
    const next=completeObservedShopExit(this.current,heroId,outerGateZ);
    if(next===this.current)return false;
    this.replace(next);
    return true;
  }

  /** Pin a real completed recording for later days, or remove its pin.
   * Only this list is mutated: not the tape, combat, RNG or world time.
   */
  toggleSavedReplay(eventId:string):string {
    const existing=this.current.savedReplayIds;
    if(existing.includes(eventId)){
      this.replace({...this.current,savedReplayIds:existing.filter(id=>id!==eventId)});
      return "Recording removed from saved highlights.";
    }
    const event=this.current.events.find(e=>e.id===eventId);
    if(!event||!containsReplay(event))return "No recording is available to save.";
    if(existing.length>=MAX_SAVED_REPLAYS)
      return "Saved highlight limit reached ("+MAX_SAVED_REPLAYS+"). Remove one first.";
    this.replace({...this.current,savedReplayIds:[...existing,eventId]});
    return "Recording saved for later days.";
  }

  purchase(itemId: ItemId, quantity: number, requestId: number): string {
    if (this.purchases.has(requestId)) return "This order was already processed.";
    this.purchases.add(requestId);
    const result = buyWholesale(this.current, itemId, quantity);
    this.replace(result.state);
    return result.message;
  }

  toggleBuybackChest():string{
    const open=!this.current.buybackChestOpen;
    this.replace({...this.current,buybackChestOpen:open});
    return open?"Recovered Goods: accepting materials.":"Recovered Goods: closed.";
  }
  buybackAtChest(heroId:string,position:{x:number;z:number}):boolean{
    const next=buybackAtChest(this.current,heroId,position);
    if(next===this.current)return false;
    this.replace(next);return true;
  }

  /** Real cellar UI calls this once per deliberate recipe selection. */
  craftAtForge(output:ForgeOutput):string {
    const result=craftAtCellarForge(this.current,output);
    if(result.state!==this.current)this.replace(result.state);
    return result.message;
  }

  transfer(slotId: string, itemId: ItemId, direction: "stock" | "remove", units = 1): string {
    const result = transferShelf(this.current, slotId, itemId, direction, units);
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
    const room=this.current.shopRoom;
    const result=excavateShopRoomCell(room,cell);
    if(!result.ok)return result.reason;
    // The mineable rock is also a possible *wall mount*. Excavating its
    // supporting stone must not strand a saved board in midair.
    const board=this.current.rosterBoard;
    if(rosterBoardProblem(board,this.current.shopLayout,result.room))
      return "Move the Adventurer Board before mining its supporting rock.";
    if(this.current.wallPortrait&&wallPortraitProblem(this.current.wallPortrait,
      this.current.shopLayout,result.room,board))
      return "Move Galvik's portrait before mining its supporting rock.";
    if(wallClockProblem(this.current.wallClock,this.current.shopLayout,
      result.room,board,this.current.wallPortrait))
      return "Move the World Clock before mining its supporting rock.";
    this.replace({...this.current,shopRoom:result.room});
    return "Rock excavated.";
  }

  toggleCellarDoor():string {
    this.replace({...this.current,cellarDoorOpen:!this.current.cellarDoorOpen});
    return this.current.cellarDoorOpen
      ?"The portrait swings aside. A staircase descends into the dark."
      :"Galvik's secret passage is concealed again.";
  }

  excavateCellarCell(cell:RoomCell):string {
    const previousRoom=this.current.cellarRoom;
    const result=excavateShopRoomCell(previousRoom,cell);
    if(!result.ok)return result.reason;
    // The relocated cellar chest uses the same mined-floor validation as P.
    const revealed=!isCellarPondUncovered(this.current.cellarRoom)&&
      isCellarPondUncovered(result.room);
    this.replace({...this.current,cellarRoom:result.room});
    if(revealed)return "An underground pond has been uncovered.";
    const remaining=pondExcavationRemaining(result.room);
    if(remaining<pondExcavationRemaining(previousRoom))
      return "Damp rock cracked. "+remaining+" pond cells remain.";
    return "Cellar rock excavated.";
  }

  recordCellarCatch():string {
    if(!isCellarPondUncovered(this.current.cellarRoom))
      return "Excavate the pond first.";
    if(this.current.cellarFishCaught>=1000000)return "Fishing record is full.";
    this.replace({...this.current,cellarFishCaught:this.current.cellarFishCaught+1});
    return "Cave fish caught! Total: "+this.current.cellarFishCaught+".";
  }

  unlockCellarExpansion(tier:number):string {
    const room=this.current.cellarRoom;
    if(!Number.isSafeInteger(tier)||tier!==room.expansionTier+1||tier>3)
      return "Invalid cellar expansion tier.";
    const next={...room,expansionTier:tier};
    if(!isValidCellarRoom(next))return "Invalid cellar geometry.";
    this.replace({...this.current,cellarRoom:next});
    return "Cellar expansion unlocked.";
  }

  unlockShopExpansion(tier:number):string {
    const room=this.current.shopRoom;
    if(!Number.isSafeInteger(tier)||tier!==room.expansionTier+1||tier>3)
      return "Invalid expansion tier.";
    const next={...room,expansionTier:tier};
    if(!isValidShopRoomGeometry(next))return "Invalid room geometry.";
    this.replace({...this.current,shopRoom:next});
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


  /** Register a real physical visitor's restock/credit petition. */
  startShopRequest(heroId:string,itemId:ItemId,reason:ShoppingReason):number|null{
    this.replace(startShopRequest(this.current,heroId,itemId,reason));
    const request=this.current.shopRequests.find(r=>r.heroId===heroId);
    return request?.dueTick??null;
  }
  shopRequestRemaining(heroId:string):number|null{
    return requestRemainingTicks(this.current,heroId);
  }
  /** Test-only override; production never shortens or resets patience. */
  shortenShopRequestForE2E(heroId:string,remainingSeconds:number):void{
    if(import.meta.env.VITE_E2E!=="1"||!Number.isFinite(remainingSeconds)||
       remainingSeconds<=0)throw new Error("Shop request test hook disabled.");
    this.replace(shortenShopRequestForTest(this.current,heroId,
      Math.max(1,Math.ceil(remainingSeconds*WORLD_TICKS_PER_GAME_MINUTE))));
  }

  /** Clock events and customer walkouts commit on the same world timeline.
   * Dungeon and customer movement owners migrate with #203 and later work.
   */
  advanceWorldTime(ticks:number):void {
    if(!Number.isSafeInteger(ticks)||ticks<0||ticks>100000)
      throw new RangeError("World tick advance must be a bounded nonnegative integer.");
    const oldTick=this.current.worldClock.tick;
    const target=Math.min(lastWorldTickOfDay(this.current.day),oldTick+ticks);
    if(target===oldTick)return;
    const advanced=advanceWorldUntil(this.current,target,
      this.current.liveDungeon.enabled?
        (state,event)=>commitLiveWorldEvent(state,event,this.dungeonDiagnostic):commitShopRequestEvent);
    // Keep saveable clock/checkpoint identities aligned while the committed
    // shop step finishes. The caller replaces the position checkpoint after
    // actually moving the customers.
    this.replace({...advanced,shopTraffic:{
      ...advanced.shopTraffic,tick:advanced.worldClock.tick}});

  }

  endDay(): void {
    // Fast-forward pending visitor deadlines using the SAME event executor.
    // No late-night unserved customer can buy stock on the following morning.
    const atClose=advanceWorldUntil(this.current,
      lastWorldTickOfDay(this.current.day),
      this.current.liveDungeon.enabled?
        (state,event)=>commitLiveWorldEvent(state,event,this.dungeonDiagnostic):commitShopRequestEvent);
    this.replace(advanceDay(closeShopRequests(atClose)).state);
  }
}
