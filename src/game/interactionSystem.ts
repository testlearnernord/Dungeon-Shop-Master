import type { MerchantAction } from "./merchantActions.ts";
import type { GameStore } from "./gameStore.ts";
import { Camera } from "@babylonjs/core/Cameras/camera";
import "@babylonjs/core/Culling/ray";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import {SHELF_GOODS,type ItemId} from "./economy.ts";
import { Shop } from "./shop";
import {describeShelfFocus} from "./shopServiceFocus.ts";
import type { WorldInteractable } from "./world";

export class InteractionSystem {
  private heldButton: number | null = null;
  private heldSlotId: string | null = null;
  private nextRepeatAt = 0;
  private nextFocusAt = 0;
  private readonly repeatDelay = 320;
  private readonly clickDelay = 220;
  private selectedIndex = 0;
  /** Excavation is an explicit player mode, never an ordinary shop click. */
  private miningMode = false;
  private message = "Click to enter the shop";

  constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly shop: Shop,
    private readonly worldItems: WorldInteractable[],
    private readonly onUpdate: (message: string, selected: ItemId) => void,
    private readonly openCatalog: () => void = () => {},
    private readonly maxInteractionDistance = 3,
    private readonly openRoster: () => void = () => {},
    private readonly checkoutRegister: () => string = () => "No customer is ready.",
    private readonly isShopActive: () => boolean = () => true,
    private readonly isNearBed: () => boolean = () => false,
    private readonly openBeggarRequest: () => boolean = () => false,
    private readonly openDebtBook: () => void = () => {},
    private readonly store?: GameStore,
    private readonly onMerchantAction: (action:MerchantAction,itemId?:ItemId)=>void = () => {},
    private readonly openFishing:()=>boolean=()=>false,
    private readonly observeTable:()=>boolean=()=>false,
    private readonly openForge:()=>boolean=()=>false,
  ) {
    this.shop.select(SHELF_GOODS[0].id);
    this.registerEvents();
    this.publish();
  }

  selectItem(itemId:ItemId):void {
    const index=SHELF_GOODS.findIndex(item=>item.id===itemId);
    if(index<0)return;
    this.selectedIndex=index;
    this.shop.select(itemId);
    this.message=`Selected ${SHELF_GOODS[index].name}.`;
    this.publish();
  }

  reset(): void {
    this.setMiningMode(false);
    this.heldButton = null;
    this.heldSlotId = null;
    this.selectedIndex = 0;
    this.shop.select(SHELF_GOODS[0].id);
    this.message = "Campaign ready. Click to enter the shop.";
    this.publish();
  }

  private setMiningMode(active:boolean):void {
    this.miningMode=active;
    this.heldButton=null;
    this.heldSlotId=null;
    const indicator=document.querySelector<HTMLElement>("#mining-mode-indicator");
    if(indicator){
      indicator.hidden=!active;
      indicator.setAttribute("aria-hidden",String(!active));
    }
  }

  private registerEvents(): void {
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("wheel", (event) => {
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      this.selectedIndex = (this.selectedIndex + direction + SHELF_GOODS.length) % SHELF_GOODS.length;
      this.shop.select(SHELF_GOODS[this.selectedIndex].id);
      this.message = `Selected ${SHELF_GOODS[this.selectedIndex].name}.`;
      this.publish();
    }, { passive: false });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (document.querySelector("dialog[open]")||!this.isShopActive()) return;
      if (event.button !== 0 && event.button !== 2) return;
      if(this.miningMode&&event.button===2){
        this.setMiningMode(false);
        this.message="Mining mode off.";
        this.publish();
        return;
      }
      // Shift+click fills/clears only once, without the held-repeat timer.
      const bulk = event.shiftKey && !this.miningMode && this.isShopActive();
      this.heldButton = bulk ? null : event.button;
      this.heldSlotId = null;
      this.nextRepeatAt = performance.now() + this.clickDelay;
      this.performPointerAction(event.button, event.offsetX, event.offsetY, bulk);
      if (document.pointerLockElement !== this.canvas && !document.querySelector("dialog[open]")) {
        void this.canvas.requestPointerLock();
      }
    });
    const releaseHeldButton = (): void => {
      this.heldButton = null;
      this.heldSlotId = null;
    };
    window.addEventListener("pointerup", releaseHeldButton);
    window.addEventListener("pointercancel", releaseHeldButton);
    window.addEventListener("blur", () => { this.heldButton = null; });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== this.canvas) this.heldButton = null;
    });
    window.addEventListener("keydown", (event) => {
      if(!event.repeat && !event.defaultPrevented && !event.altKey && !event.ctrlKey &&
          !event.metaKey && !event.shiftKey && this.isShopActive() && !document.querySelector("dialog[open]") &&
          !(event.target instanceof HTMLElement &&
            (event.target.isContentEditable || ["INPUT","TEXTAREA","SELECT","BUTTON"].includes(event.target.tagName))) &&
          /^Digit[1-5]$/.test(event.code)){
        this.selectItem(SHELF_GOODS[Number(event.code.slice(-1))-1].id);
        event.preventDefault();
        return;
      }
      if(event.code==="Escape"&&this.miningMode){
        this.setMiningMode(false);
        this.message="Mining mode off.";
        this.publish();
        event.preventDefault();
        return;
      }
      if(event.code==="KeyU"&&!event.repeat&&this.store&&this.isShopActive()&&
        !document.querySelector("dialog[open]")&&!event.altKey&&!event.ctrlKey&&
        !event.metaKey&&!(event.target instanceof HTMLElement&&
          (event.target.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName)))){
        const cellar=this.camera.position.z<-19.3&&this.camera.position.y< -1.5;
        if(event.shiftKey){
          const tier=cellar?this.store.state.cellarRoom.expansionTier:
            this.store.state.shopRoom.expansionTier;
          this.message=cellar?this.store.unlockCellarExpansion(tier+1):
            this.store.unlockShopExpansion(tier+1);
          this.publish();event.preventDefault();return;
        }
        if(this.miningMode){
          this.setMiningMode(false);
          this.message="Mining mode off.";
        }else{
          const tier=cellar?this.store.state.cellarRoom.expansionTier:
            this.store.state.shopRoom.expansionTier;
          if(tier===0)this.message=this.store.unlockShopExpansion(1);
          const unlocked=(cellar?this.store.state.cellarRoom.expansionTier:
            this.store.state.shopRoom.expansionTier)>0;
          this.setMiningMode(unlocked);
          this.message=unlocked
            ?"Mining mode ON · Left-click exposed rock · U / Esc / right-click to cancel."
            :this.message;
        }
        this.publish();event.preventDefault();return;
      }
      if (event.code !== "KeyE" || event.repeat || !this.isShopActive() ||
          document.querySelector("dialog[open]") ||
          event.target instanceof HTMLElement &&
          (event.target.isContentEditable || ["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName))) return;
      // Galvik's bed owns a deliberate 1.5 second hold, never a tap.
      // Do not also fire a cash register / generic E interaction.
      if (this.isNearBed()) return;
      this.interact();
    });
    this.scene.onBeforeRenderObservable.add(() => {
      if(performance.now()>=this.nextFocusAt){
        this.nextFocusAt=performance.now()+140;
        this.updateShelfFocus();
      }
      if (this.heldButton === null || performance.now() < this.nextRepeatAt) return;
      if (document.querySelector("dialog[open]")) {
        this.heldButton = null;
        return;
      }
      this.nextRepeatAt = performance.now() + this.repeatDelay;
      this.performPointerAction(this.heldButton, 0, 0, false, true);
    });
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERMOVE || this.heldButton === null) return;
      if (info.event.buttons === 0) {
        this.heldButton = null;
        this.heldSlotId = null;
      }
    });
  }

  /** The crosshair uses the same pickable physical slot meshes as clicks.
   * Read-only and throttled: no stock transfers or navigation on hover.
   */
  private updateShelfFocus():void {
    const panel=document.querySelector<HTMLElement>("#shop-shelf-focus");
    const heading=document.querySelector<HTMLElement>("#shelf-focus-title");
    const action=document.querySelector<HTMLElement>("#shelf-focus-action");
    if(!panel||!heading||!action)return;
    if(!this.store||!this.isShopActive()||this.miningMode||
       document.querySelector("dialog[open]")||
       document.body.classList.contains("blueprint-active")){
      panel.hidden=true;
      return;
    }
    const hit=this.scene.pickWithRay(this.camera.getForwardRay(
      this.maxInteractionDistance));
    const mesh=hit?.pickedMesh;
    const slot=mesh&&this.shop.slotMeshes.get(mesh as Mesh);
    const current=slot&&this.store.state.shopEconomy.slots.find(
      entry=>entry.id===slot.id);
    if(!hit?.hit||!current||hit.distance>this.maxInteractionDistance){
      panel.hidden=true;
      return;
    }
    const locked=this.store.state.shopCarts.some(cart=>
      cart.lines.some(line=>line.slotId===current.id));
    const hint=describeShelfFocus(current,SHELF_GOODS[this.selectedIndex].id,
      this.store.state.shopEconomy.bag,locked);
    if(heading.textContent!==hint.title)heading.textContent=hint.title;
    if(action.textContent!==hint.instruction)
      action.textContent=hint.instruction;
    panel.dataset.tone=hint.tone;
    panel.dataset.slotId=current.id;
    panel.hidden=false;
  }

  private performPointerAction(button: number, x: number, y: number,
    bulk = false, repeated = false): void {
    const rect = this.canvas.getBoundingClientRect();
    const locked = document.pointerLockElement === this.canvas;
    const pickX = locked ? rect.width / 2 : x;
    const pickY = locked ? rect.height / 2 : y;
    const hit = this.scene.pick(pickX, pickY);
    if (!hit?.hit || !hit.pickedMesh) return;

    const metadata=hit.pickedMesh.metadata as {
      level5MineCell?:{x:number;z:number};cellarMineCell?:{x:number;z:number}
    }|null;
    const mineCell=metadata?.level5MineCell??metadata?.cellarMineCell;
    if(mineCell){
      if(!this.miningMode||button!==0||!this.store)return;
      if(hit.distance>this.maxInteractionDistance)this.message="Move closer to the rock.";
      else{
        const before=this.store.state;
        this.message=metadata?.cellarMineCell
          ?this.store.excavateCellarCell(mineCell):this.store.excavateShopCell(mineCell);
        if(this.store.state!==before)this.onMerchantAction("mine");
      }
      this.publish();return;
    }
    const slot = this.shop.slotMeshes.get(hit.pickedMesh as Mesh);
    // Normal held clicks must never spill stock into a neighboring slot.
    if(repeated && this.heldSlotId && (!slot || slot.id!==this.heldSlotId)){
      this.heldButton=null;
      this.heldSlotId=null;
      return;
    }
    if (slot) {
      if(!repeated && this.heldButton !== null) this.heldSlotId=slot.id;
      if (hit.distance > this.maxInteractionDistance) {
        this.message = "Move closer to reach that shelf slot.";
        this.publish();
        return;
      }
      const before=this.store?.state;
      // Destocking transfers the actual slot product, regardless of which
      // bag item happens to be selected. Capture it before the store refresh.
      const transferredItem=button===0?SHELF_GOODS[this.selectedIndex].id:slot.itemId;
      this.message = button === 0
        ? this.shop.stock(slot,bulk ? slot.capacity : 1)
        : this.shop.remove(slot,bulk ? slot.capacity : 1);
      if(this.store&&this.store.state!==before&&transferredItem)
        this.onMerchantAction(button===0?"stock":"destock",transferredItem);
    } else {
      const target = this.worldItems.find(({ mesh }) => mesh === hit.pickedMesh);
      if (target?.kind === "register" && button === 0) {
        this.message = this.checkoutRegister();
      } else if (target?.kind === "roster-board" && button === 0) {
        if (hit.distance > this.maxInteractionDistance) this.message = "Move closer to the roster board.";
        else {
          this.message = "Adventurer roster opened.";
          this.openRoster();
        }
      } else if(target?.kind==="cellar-pond"&&button===0){
        this.message=hit.distance<=this.maxInteractionDistance&&this.openFishing()
          ?"Fishing at the underground pond.":"Move closer to the water.";
      } else if(target?.kind==="cellar-forge"&&button===0){
        this.message=hit.distance<=this.maxInteractionDistance&&this.openForge()
          ?"The cellar forge is ready.":"Move closer to the anvil.";
      } else if(target?.kind==="cellar-door"&&button===0&&this.store){
        this.message=hit.distance<=this.maxInteractionDistance
          ?this.store.toggleCellarDoor():"Move closer to the portrait.";
      } else if(target?.kind==="debt-book" && button===0){
        if(hit.distance>this.maxInteractionDistance)this.message="Move closer to Galvik's account book.";
        else {this.message="Galvik's Book of Debts opened.";this.openDebtBook();}
      }
    }
    this.publish();
  }

  private interact(): void {
    if(!this.isShopActive())return;
    if(this.observeTable()){
      this.message="Observing the LIVE Dungeon through Galvik's Table.";
      this.publish();
      return;
    }
    const pick = this.scene.pickWithRay(this.camera.getForwardRay(this.maxInteractionDistance));
    const target = this.worldItems.find(({ mesh }) => mesh === pick?.pickedMesh);
    if (target?.kind === "register") {
      this.message = this.checkoutRegister();
    } else if (target?.kind === "roster-board") {
      this.message = "Adventurer roster opened.";
      this.openRoster();
    } else if(target?.kind==="cellar-pond"){
      this.message=this.openFishing()
        ?"Fishing at the underground pond.":"The water cannot be reached.";
    } else if(target?.kind==="cellar-forge"){
      this.message=this.openForge()
        ?"The cellar forge is ready.":"The anvil cannot be reached.";
    } else if(target?.kind==="cellar-door"&&this.store){
      this.message=this.store.toggleCellarDoor();
    } else if(target?.kind==="debt-book"){
      this.message="Galvik's Book of Debts opened.";
      this.openDebtBook();
    } else if (this.openBeggarRequest()) {
      this.message = "Review the adventurer's credit plea.";
    } else {
      this.message = "Nothing nearby to interact with.";
    }
    this.publish();
  }

  private publish(): void {
    this.onUpdate(this.message, SHELF_GOODS[this.selectedIndex].id);
  }
}
