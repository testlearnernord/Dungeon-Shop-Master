import type { MerchantAction } from "./merchantActions.ts";
import type { GameStore } from "./gameStore.ts";
import { Camera } from "@babylonjs/core/Cameras/camera";
import "@babylonjs/core/Culling/ray";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { ITEMS, type ItemId } from "./inventory";
import { Shop } from "./shop";
import type { WorldInteractable } from "./world";

export class InteractionSystem {
  private heldButton: number | null = null;
  private nextRepeatAt = 0;
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
    private readonly onMerchantAction: (action:MerchantAction)=>void = () => {},
  ) {
    this.shop.select(ITEMS[0].id);
    this.registerEvents();
    this.publish();
  }

  selectItem(itemId:ItemId):void {
    const index=ITEMS.findIndex(item=>item.id===itemId);
    if(index<0)return;
    this.selectedIndex=index;
    this.shop.select(itemId);
    this.message=`Selected ${ITEMS[index].name}.`;
    this.publish();
  }

  reset(): void {
    this.setMiningMode(false);
    this.heldButton = null;
    this.selectedIndex = 0;
    this.shop.select(ITEMS[0].id);
    this.message = "Campaign ready. Click to enter the shop.";
    this.publish();
  }

  private setMiningMode(active:boolean):void {
    this.miningMode=active;
    this.heldButton=null;
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
      this.selectedIndex = (this.selectedIndex + direction + ITEMS.length) % ITEMS.length;
      this.shop.select(ITEMS[this.selectedIndex].id);
      this.message = `Selected ${ITEMS[this.selectedIndex].name}.`;
      this.publish();
    }, { passive: false });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.button !== 0 && event.button !== 2) return;
      if(this.miningMode&&event.button===2){
        this.setMiningMode(false);
        this.message="Mining mode off.";
        this.publish();
        return;
      }
      this.heldButton = event.button;
      this.nextRepeatAt = performance.now() + this.clickDelay;
      this.performPointerAction(event.button, event.offsetX, event.offsetY);
      if (document.pointerLockElement !== this.canvas && !document.querySelector("dialog[open]")) {
        void this.canvas.requestPointerLock();
      }
    });
    const releaseHeldButton = (): void => { this.heldButton = null; };
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
          /^Digit[1-6]$/.test(event.code)){
        this.selectItem(ITEMS[Number(event.code.slice(-1))-1].id);
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
        if(event.shiftKey){
          const tier=this.store.state.level5Room?.expansionTier??0;
          this.message=this.store.unlockShopExpansion(tier+1);
          this.publish();event.preventDefault();return;
        }
        if(this.miningMode){
          this.setMiningMode(false);
          this.message="Mining mode off.";
        }else{
          const tier=this.store.state.level5Room?.expansionTier??0;
          if(tier===0)this.message=this.store.unlockShopExpansion(1);
          const unlocked=(this.store.state.level5Room?.expansionTier??0)>0;
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
      if (this.heldButton === null || performance.now() < this.nextRepeatAt) return;
      if (document.querySelector("dialog[open]")) {
        this.heldButton = null;
        return;
      }
      this.nextRepeatAt = performance.now() + this.repeatDelay;
      this.performPointerAction(this.heldButton, 0, 0);
    });
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERMOVE || this.heldButton === null) return;
      if (info.event.buttons === 0) this.heldButton = null;
    });
  }

  private performPointerAction(button: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const locked = document.pointerLockElement === this.canvas;
    const pickX = locked ? rect.width / 2 : x;
    const pickY = locked ? rect.height / 2 : y;
    const hit = this.scene.pick(pickX, pickY);
    if (!hit?.hit || !hit.pickedMesh) return;

    const mineCell=(hit.pickedMesh.metadata as {level5MineCell?:{x:number;z:number}}|null)?.level5MineCell;
    if(mineCell){
      if(!this.miningMode||button!==0||!this.store)return;
      if(hit.distance>this.maxInteractionDistance)this.message="Move closer to the rock.";
      else{
        const before=this.store.state;
        this.message=this.store.excavateShopCell(mineCell);
        if(this.store.state!==before)this.onMerchantAction("mine");
      }
      this.publish();return;
    }
    const slot = this.shop.slotMeshes.get(hit.pickedMesh as Mesh);
    if (slot) {
      if (hit.distance > this.maxInteractionDistance) {
        this.message = "Move closer to reach that shelf slot.";
        this.publish();
        return;
      }
      const before=this.store?.state;
      this.message = button === 0 ? this.shop.stock(slot) : this.shop.remove(slot);
      if(this.store && this.store.state!==before)this.onMerchantAction(button===0?"stock":"destock");
    } else {
      const target = this.worldItems.find(({ mesh }) => mesh === hit.pickedMesh);
      if (target?.kind === "register") {
        this.message = "Wholesale catalog opened. Visitors buy on confirmed End Day.";
        this.openCatalog();
      } else if (target?.kind === "roster-board" && button === 0) {
        if (hit.distance > this.maxInteractionDistance) this.message = "Move closer to the roster board.";
        else {
          this.message = "Adventurer roster opened.";
          this.openRoster();
        }
      } else if(target?.kind==="debt-book" && button===0){
        if(hit.distance>this.maxInteractionDistance)this.message="Move closer to Galvik's account book.";
        else {this.message="Galvik's Book of Debts opened.";this.openDebtBook();}
      }
    }
    this.publish();
  }

  private interact(): void {
    if(!this.isShopActive())return;
    const pick = this.scene.pickWithRay(this.camera.getForwardRay(this.maxInteractionDistance));
    const target = this.worldItems.find(({ mesh }) => mesh === pick?.pickedMesh);
    if (target?.kind === "register") {
      this.message = this.checkoutRegister();
    } else if (target?.kind === "roster-board") {
      this.message = "Adventurer roster opened.";
      this.openRoster();
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
    this.onUpdate(this.message, ITEMS[this.selectedIndex].id);
  }
}
