import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { Inventory, ITEMS, type ItemId, type Slot } from "./inventory";

const SLOT_CAPACITY = 5;

export class Shop {
  readonly slots: Slot[] = [];
  readonly slotMeshes = new Map<Mesh, Slot>();
  private readonly slotMaterials = new Map<ItemId | "empty", StandardMaterial>();
  private readonly itemVisuals = new Map<string, Mesh[]>();

  constructor(
    private readonly scene: Scene,
    private readonly inventory: Inventory,
  ) {
    for (const item of ITEMS) {
      const color = Color3.FromHexString(item.color);
      const material = new StandardMaterial(`${item.id}-material`, scene);
      material.diffuseColor = color;
      material.specularColor = new Color3(0.15, 0.15, 0.15);
      this.slotMaterials.set(item.id, material);
    }
    const empty = new StandardMaterial("empty-slot-material", scene);
    empty.diffuseColor = new Color3(0.33, 0.26, 0.19);
    this.slotMaterials.set("empty", empty);
    this.createShelves();
  }

  stock(slot: Slot): string {
    const selected = this.selectedItem;
    if (!selected || this.inventory.count(selected.id) < 1) {
      return "You're out of the selected item.";
    }
    if ((slot.itemId && slot.itemId !== selected.id) || slot.quantity >= slot.capacity) {
      return "That slot is full or holds a different item.";
    }
    this.inventory.remove(selected.id);
    slot.itemId = selected.id;
    slot.quantity += 1;
    this.updateSlot(slot);
    return `Placed ${selected.name}.`;
  }

  remove(slot: Slot): string {
    if (!slot.itemId || slot.quantity < 1) {
      return "That slot is empty.";
    }
    if (!this.inventory.add(slot.itemId)) {
      return "Your inventory is full.";
    }
    const item = ITEMS.find(({ id }) => id === slot.itemId);
    slot.quantity -= 1;
    if (slot.quantity === 0) {
      slot.itemId = null;
    }
    this.updateSlot(slot);
    return `Returned ${item?.name ?? "item"} to your inventory.`;
  }

  private get selectedItem() {
    return ITEMS.find(({ id }) => id === this.selectedItemId);
  }

  private selectedItemId: ItemId = ITEMS[0].id;

  select(itemId: ItemId): void {
    this.selectedItemId = itemId;
  }

  private createShelves(): void {
    for (const [shelfIndex, x] of [-3.8, 3.8].entries()) {
      const shelfId = `shelf-${shelfIndex + 1}`;
      const bodyMaterial = new StandardMaterial(`${shelfId}-wood`, this.scene);
      bodyMaterial.diffuseColor = new Color3(0.28, 0.18, 0.11);
      const back = MeshBuilder.CreateBox(`${shelfId}-back`, { width: 0.18, height: 2, depth: 5.8 }, this.scene);
      back.position.set(x, 1.35, 0);
      back.material = bodyMaterial;
      back.checkCollisions = true;
      const plank = MeshBuilder.CreateBox(`${shelfId}-plank`, { width: 1.2, height: 0.18, depth: 5.8 }, this.scene);
      plank.position.set(x + (x < 0 ? 0.48 : -0.48), 0.65, 0);
      plank.material = bodyMaterial;
      plank.checkCollisions = true;

      for (let index = 0; index < 5; index += 1) {
        const slot: Slot = {
          id: `${shelfId}-slot-${index + 1}`,
          shelfId,
          index,
          itemId: null,
          quantity: 0,
          capacity: SLOT_CAPACITY,
        };
        const slotMesh = MeshBuilder.CreateBox(slot.id, { width: 0.76, height: 0.14, depth: 0.78 }, this.scene);
        slotMesh.position.set(x + (x < 0 ? 0.48 : -0.48), 0.82, index - 2);
        slotMesh.material = this.slotMaterials.get("empty")!;
        slotMesh.checkCollisions = true;
        slotMesh.metadata = { kind: "shelf-slot", slotId: slot.id };
        this.slots.push(slot);
        this.slotMeshes.set(slotMesh, slot);
        this.createSlotLabel(slot, slotMesh.position);
      }
    }
  }

  private createSlotLabel(slot: Slot, position: Vector3): void {
    const label = MeshBuilder.CreateBox(`${slot.id}-number`, { width: 0.24, height: 0.08, depth: 0.2 }, this.scene);
    label.position.set(position.x, position.y - 0.12, position.z + 0.38);
    label.material = this.slotMaterials.get("empty")!;
    label.isPickable = false;
  }

  private updateSlot(slot: Slot): void {
    const slotMesh = [...this.slotMeshes].find(([, candidate]) => candidate === slot)?.[0];
    if (!slotMesh) return;
    slotMesh.material = this.slotMaterials.get(slot.itemId ?? "empty")!;
    for (const visual of this.itemVisuals.get(slot.id) ?? []) {
      visual.dispose();
    }
    const visuals: Mesh[] = [];
    if (slot.itemId) {
      for (let count = 0; count < slot.quantity; count += 1) {
        const item = ITEMS.find(({ id }) => id === slot.itemId)!;
        const mesh = item.id === "mana-potion"
          ? MeshBuilder.CreateCylinder(`${slot.id}-item-${count}`, { height: 0.38, diameter: 0.22 }, this.scene)
          : item.id === "healing-herb"
            ? MeshBuilder.CreateSphere(`${slot.id}-item-${count}`, { diameter: 0.3 }, this.scene)
            : MeshBuilder.CreateBox(`${slot.id}-item-${count}`, { size: item.id === "bread" ? 0.28 : 0.32 }, this.scene);
        mesh.position.set(slotMesh.position.x, 1.08 + (count % 2) * 0.25, slotMesh.position.z + (count - 2) * 0.12);
        mesh.material = this.slotMaterials.get(slot.itemId)!;
        mesh.isPickable = false;
        visuals.push(mesh);
      }
    }
    this.itemVisuals.set(slot.id, visuals);
  }
}
