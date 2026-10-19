import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { ITEMS, type ItemId, type Slot } from "./inventory";
import { GameStore } from "./gameStore";

export class Shop {
  readonly slotMeshes = new Map<Mesh, Slot>();
  private readonly slotMaterials = new Map<ItemId | "empty", StandardMaterial>();
  private readonly itemVisuals = new Map<string, Mesh[]>();

  constructor(
    private readonly scene: Scene,
    private readonly store: GameStore,
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
    this.refresh();
    this.store.subscribe(() => this.refresh());
  }

  stock(slot: Slot): string {
    return this.store.transfer(slot.id, this.selectedItemId, "stock");
  }

  remove(slot: Slot): string {
    return this.store.transfer(slot.id, slot.itemId ?? this.selectedItemId, "remove");
  }

  private refresh(): void {
    for (const [mesh, previous] of this.slotMeshes) {
      const slot = this.store.state.shopEconomy.slots.find(({ id }) => id === mesh.name)!;
      this.slotMeshes.set(mesh, slot);
      if (previous.itemId !== slot.itemId || previous.quantity !== slot.quantity) this.updateSlot(slot);
    }
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
      back.isPickable = false;
      const plank = MeshBuilder.CreateBox(`${shelfId}-plank`, { width: 1.2, height: 0.18, depth: 5.8 }, this.scene);
      plank.position.set(x + (x < 0 ? 0.48 : -0.48), 0.65, 0);
      plank.material = bodyMaterial;
      plank.checkCollisions = true;
      plank.isPickable = false;

      for (let index = 0; index < 5; index += 1) {
        const slot = this.store.state.shopEconomy.slots.find(({ id }) =>
          id === `${shelfId}-slot-${index + 1}`)!;
        const slotMesh = MeshBuilder.CreateBox(slot.id, { width: 0.76, height: 0.14, depth: 0.78 }, this.scene);
        slotMesh.position.set(x + (x < 0 ? 0.48 : -0.48), 0.82, index - 2);
        slotMesh.material = this.slotMaterials.get("empty")!;
        slotMesh.checkCollisions = true;
        slotMesh.isPickable = true;
        slotMesh.metadata = { kind: "shelf-slot", slotId: slot.id };
        this.slotMeshes.set(slotMesh, slot);
        this.createSlotLabel(slot, slotMesh.position);
        this.updateSlot(slot);
      }
    }
  }

  private createSlotLabel(slot: Slot, position: Vector3): void {
    const label = MeshBuilder.CreatePlane(`${slot.id}-number`, { width: 0.24, height: 0.2 }, this.scene);
    const shelfSide = slot.shelfId === "shelf-1" ? 1 : -1;
    label.position.set(position.x + shelfSide * 0.4, 1.08, position.z);
    label.rotation.y = shelfSide * Math.PI / 2;
    const texture = new DynamicTexture(`${slot.id}-number-texture`, { width: 128, height: 128 }, this.scene, false);
    texture.drawText(String(slot.index + 1), null, 94, "bold 92px monospace", "#f2d69a", "#292018", true);
    const labelMaterial = new StandardMaterial(`${slot.id}-number-material`, this.scene);
    labelMaterial.diffuseTexture = texture;
    labelMaterial.emissiveColor = new Color3(0.25, 0.18, 0.08);
    labelMaterial.backFaceCulling = false;
    label.material = labelMaterial;
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
