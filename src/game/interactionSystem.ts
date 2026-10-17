import { Camera } from "@babylonjs/core/Cameras/camera";
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
  ) {
    this.shop.select(ITEMS[0].id);
    this.registerEvents();
    this.publish();
  }

  private registerEvents(): void {
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      this.selectedIndex = (this.selectedIndex + direction + ITEMS.length) % ITEMS.length;
      this.shop.select(ITEMS[this.selectedIndex].id);
      this.message = `Selected ${ITEMS[this.selectedIndex].name}.`;
      this.publish();
    }, { passive: false });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (document.pointerLockElement !== this.canvas) {
        void this.canvas.requestPointerLock();
      }
      this.heldButton = event.button;
      this.nextRepeatAt = performance.now() + this.clickDelay;
      this.performPointerAction(event.button, event.offsetX, event.offsetY);
    });
    window.addEventListener("pointerup", () => { this.heldButton = null; });
    window.addEventListener("blur", () => { this.heldButton = null; });
    window.addEventListener("keydown", (event) => {
      if (event.code !== "KeyE" || event.repeat) return;
      this.interact();
    });
    this.scene.onBeforeRenderObservable.add(() => {
      if (this.heldButton === null || performance.now() < this.nextRepeatAt) return;
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
      this.message = button === 0 ? this.shop.stock(slot) : this.shop.remove(slot);
    } else {
      const target = this.worldItems.find(({ mesh }) => mesh === hit.pickedMesh);
      if (target?.kind === "register") {
        this.message = "Galvik's register is ready. Transactions aren't available yet.";
      }
    }
    this.publish();
  }

  private interact(): void {
    const pick = this.scene.pickWithRay(this.camera.getForwardRay(3));
    const target = this.worldItems.find(({ mesh }) => mesh === pick?.pickedMesh);
    this.message = target?.kind === "register"
      ? "Galvik's register is ready. Transactions aren't available yet."
      : "Nothing nearby to interact with.";
    this.publish();
  }

  private publish(): void {
    this.onUpdate(this.message, ITEMS[this.selectedIndex].id);
  }
}
