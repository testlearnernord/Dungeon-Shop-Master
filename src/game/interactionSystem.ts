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
  ) {
    this.shop.select(ITEMS[0].id);
    this.registerEvents();
    this.publish();
  }

  reset(): void {
    this.heldButton = null;
    this.selectedIndex = 0;
    this.shop.select(ITEMS[0].id);
    this.message = "Campaign ready. Click to enter the shop.";
    this.publish();
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
      if (event.code !== "KeyE" || event.repeat || document.querySelector("dialog[open]")) return;
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

    const slot = this.shop.slotMeshes.get(hit.pickedMesh as Mesh);
    if (slot) {
      if (hit.distance > this.maxInteractionDistance) {
        this.message = "Move closer to reach that shelf slot.";
        this.publish();
        return;
      }
      this.message = button === 0 ? this.shop.stock(slot) : this.shop.remove(slot);
    } else {
      const target = this.worldItems.find(({ mesh }) => mesh === hit.pickedMesh);
      if (target?.kind === "register") {
        this.message = "Wholesale catalog opened. Visitors buy on confirmed End Day.";
        this.openCatalog();
      }
    }
    this.publish();
  }

  private interact(): void {
    const pick = this.scene.pickWithRay(this.camera.getForwardRay(3));
    const target = this.worldItems.find(({ mesh }) => mesh === pick?.pickedMesh);
    if (target?.kind === "register") {
      this.message = "Wholesale catalog opened. Visitors buy on confirmed End Day.";
      this.openCatalog();
    } else {
      this.message = "Nothing nearby to interact with.";
    }
    this.publish();
  }

  private publish(): void {
    this.onUpdate(this.message, ITEMS[this.selectedIndex].id);
  }
}
