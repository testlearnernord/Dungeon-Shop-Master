import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { ITEMS, type ItemId, type Slot } from "./inventory";
import { GameStore } from "./gameStore";
import { getDungeonSurfaces } from "./dungeonSurfaces";
import {
  COMPACT_COUNTER, getCounterPlacement, rotateShelfOffset, shopLayoutProblem,
  type CounterPlacement, type ShelfId, type ShelfPlacement,
} from "./shopLayout.ts";

interface ShelfGroup {
  root: TransformNode;
  previewOutline: Mesh;
}

/** Shelf inventory IDs never change when a physical shelf is moved or rotated. */
export class Shop {
  readonly slotMeshes = new Map<Mesh, Slot>();
  private readonly slotById = new Map<string, Mesh>();
  private readonly slotMaterials = new Map<ItemId | "empty", StandardMaterial>();
  private readonly itemVisuals = new Map<string, Mesh[]>();
  private readonly shelves = new Map<ShelfId, ShelfGroup>();
  private readonly validMaterial: StandardMaterial;
  private readonly counterOutline: Mesh;
  private readonly invalidMaterial: StandardMaterial;
  private selectedItemId: ItemId = ITEMS[0].id;

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

    const makeGuide = (name: string, color: Color3) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.45);
      mat.alpha = 0.6;
      mat.wireframe = true;
      mat.disableLighting = true;
      return mat;
    };
    this.validMaterial = makeGuide("placement-valid", new Color3(0.28, 0.94, 0.52));
    this.invalidMaterial = makeGuide("placement-invalid", new Color3(1, 0.23, 0.22));
    this.counterOutline=MeshBuilder.CreateBox("counter-placement-preview",{
      width:COMPACT_COUNTER.clearanceWidth,height:1.8,depth:COMPACT_COUNTER.clearanceDepth,
    },scene);
    this.counterOutline.material=this.validMaterial;
    this.counterOutline.isPickable=false;
    this.counterOutline.checkCollisions=false;
    this.counterOutline.setEnabled(false);
    this.createShelves();
    this.syncPlacements();
    this.refresh();
    this.store.subscribe(() => {
      this.refresh();
      this.syncPlacements();
    });
  }

  select(itemId: ItemId): void { this.selectedItemId = itemId; }
  stock(slot: Slot): string {
    return this.store.transfer(slot.id, this.selectedItemId, "stock");
  }
  remove(slot: Slot): string {
    return this.store.transfer(slot.id, slot.itemId ?? this.selectedItemId, "remove");
  }

  /** Non-authoritative ghost preview; game/save state is only committed by GameStore. */
  previewPlacement(placement: ShelfPlacement | (CounterPlacement & {readonly id:"counter"}) | null,
    occupied = false): void {
    this.syncPlacements();
    for (const group of this.shelves.values()) group.previewOutline.setEnabled(false);
    this.counterOutline.setEnabled(false);
    if (!placement) return;
    if(placement.id==="counter"){
      this.positionCounter(placement);
      this.counterOutline.material=shopLayoutProblem({
        ...this.store.state.shopLayout,counter:placement,
      },this.store.state.level5Room)||occupied?this.invalidMaterial:this.validMaterial;
      this.counterOutline.setEnabled(true);
      return;
    }
    const group = this.shelves.get(placement.id);
    if (!group) return;
    this.positionShelf(group, placement);
    group.previewOutline.material = shopLayoutProblem({
      ...this.store.state.shopLayout,
      shelves:this.store.state.shopLayout.shelves.map(p=>
        p.id===placement.id?placement:p),
    },this.store.state.level5Room) || occupied ? this.invalidMaterial : this.validMaterial;
    group.previewOutline.setEnabled(true);
  }

  /** For subsequent shopping/navigation AI: shelf position, never a hard-coded aisle. */
  shelfAccessPoint(slot: Slot): Vector3 {
    const placement = this.store.state.shopLayout.shelves.find(p=>p.id===slot.shelfId)!;
    const offset = rotateShelfOffset(1.75, slot.index - 2, placement.rotation);
    return new Vector3(placement.x + offset.x, 0, placement.z + offset.z);
  }

  private syncPlacements(): void {
    for (const p of this.store.state.shopLayout.shelves) {
      const group = this.shelves.get(p.id);
      if (group) this.positionShelf(group,p);
    }
    this.positionCounter(getCounterPlacement(this.store.state.shopLayout));
  }
  private positionCounter(p:CounterPlacement):void {
    const put=(name:string,x:number,y:number,z:number)=>{
      const mesh=this.scene.getMeshByName(name);
      if(!mesh)return;
      const offset=rotateShelfOffset(x,z,p.rotation);
      mesh.position.set(p.x+offset.x,y,p.z+offset.z);
      mesh.rotation.y=p.rotation*Math.PI/2;
    };
    put("checkout-counter",0,0.68,0);
    put("counter-top",0,1.32,0);
    put("register-base",0.35,1.55,0);
    put("cash-register",0.35,1.87,-0.1);
    this.counterOutline.position.set(p.x,0.95,p.z);
    this.counterOutline.rotation.y=p.rotation*Math.PI/2;
  }
  private positionShelf(group: ShelfGroup, p: ShelfPlacement): void {
    group.root.position.set(p.x, 0, p.z);
    group.root.rotation.y = p.rotation * Math.PI / 2;
  }

  private refresh(): void {
    for (const [mesh, previous] of this.slotMeshes) {
      const slot = this.store.state.shopEconomy.slots.find(({id})=>id===mesh.name)!;
      this.slotMeshes.set(mesh, slot);
      if (previous.itemId !== slot.itemId || previous.quantity !== slot.quantity)
        this.updateSlot(slot);
    }
  }

  private createShelves(): void {
    for (const shelfId of ["shelf-1", "shelf-2"] as const) {
      const root = new TransformNode(shelfId+"-root", this.scene);
      const material = getDungeonSurfaces(this.scene).wood;
      const back = MeshBuilder.CreateBox(shelfId+"-back",{
        width:0.18,height:2,depth:5.8,
      },this.scene);
      back.parent = root;
      back.position.set(0,1.35,0);
      back.material = material;
      back.checkCollisions = true;
      back.isPickable = true; // Looking at the frame, not only stock slots, selects the shelf for P
      const plank=MeshBuilder.CreateBox(shelfId+"-plank",{
        width:1.2,height:0.18,depth:5.8,
      },this.scene);
      plank.parent=root;
      plank.position.set(0.48,0.65,0);
      plank.material=material;
      plank.checkCollisions=true;
      plank.isPickable=true;

      const outline=MeshBuilder.CreateBox(shelfId+"-placement-preview",{
        width:1.36,height:2.35,depth:6.1,
      },this.scene);
      outline.parent=root;
      outline.position.set(0.48,1.27,0);
      outline.material=this.validMaterial;
      outline.isPickable=false;
      outline.checkCollisions=false;
      outline.setEnabled(false);
      this.shelves.set(shelfId,{root,previewOutline:outline});

      for(let index=0;index<5;index++){
        const slot=this.store.state.shopEconomy.slots.find(({id})=>
          id===`${shelfId}-slot-${index+1}`)!;
        const mesh=MeshBuilder.CreateBox(slot.id,{
          width:0.76,height:0.14,depth:0.78,
        },this.scene);
        mesh.parent=root;
        mesh.position.set(0.48,0.82,index-2);
        mesh.material=this.slotMaterials.get("empty")!;
        mesh.checkCollisions=true;
        mesh.isPickable=true;
        mesh.metadata={kind:"shelf-slot",slotId:slot.id};
        this.slotMeshes.set(mesh,slot);
        this.slotById.set(slot.id,mesh);
        this.createSlotLabel(slot,root);
      }
    }
    this.syncPlacements();
    for(const slot of this.store.state.shopEconomy.slots) this.updateSlot(slot);
  }

  private createSlotLabel(slot:Slot,root:TransformNode):void {
    const label=MeshBuilder.CreatePlane(slot.id+"-number",{
      width:0.24,height:0.2,
    },this.scene);
    label.parent=root;
    label.position.set(0.88,1.08,slot.index-2);
    label.rotation.y=Math.PI/2;
    const texture=new DynamicTexture(slot.id+"-number-texture",{
      width:128,height:128,
    },this.scene,false);
    texture.drawText(String(slot.index+1),null,94,"bold 92px monospace",
      "#f2d69a","#292018",true);
    const mat=new StandardMaterial(slot.id+"-number-material",this.scene);
    mat.diffuseTexture=texture;
    mat.emissiveColor=new Color3(0.25,0.18,0.08);
    mat.backFaceCulling=false;
    label.material=mat;
    label.isPickable=false;
  }

  private updateSlot(slot:Slot):void {
    const mesh=this.slotById.get(slot.id);
    if(!mesh)return;
    mesh.material=this.slotMaterials.get(slot.itemId??"empty")!;
    for(const visual of this.itemVisuals.get(slot.id)??[])visual.dispose();
    const visuals:Mesh[]=[];
    if(slot.itemId){
      const item=ITEMS.find(entry=>entry.id===slot.itemId)!;
      const root=this.shelves.get(slot.shelfId as ShelfId)!.root;
      for(let count=0;count<slot.quantity;count++){
        const visual=item.id==="mana-potion"
          ? MeshBuilder.CreateCylinder(slot.id+"-item-"+count,{
            height:0.38,diameter:0.22,
          },this.scene)
          : item.id==="healing-herb"
            ? MeshBuilder.CreateSphere(slot.id+"-item-"+count,{
              diameter:0.3,
            },this.scene)
            : MeshBuilder.CreateBox(slot.id+"-item-"+count,{
              size:item.id==="bread"?0.28:0.32,
            },this.scene);
        visual.parent=root;
        visual.position.set(0.48,1.08+(count%2)*0.25,
          slot.index-2+(count-2)*0.12);
        visual.material=this.slotMaterials.get(slot.itemId)!;
        visual.isPickable=false;
        visuals.push(visual);
      }
    }
    this.itemVisuals.set(slot.id,visuals);
  }
}
