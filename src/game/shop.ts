import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { SHELF_GOODS,isShelfGood, type ItemId, type Slot } from "./economy.ts";
import { cloneShopStockModel, getShopStockTemplates } from "./shopStockAssets.ts";
import { GameStore } from "./gameStore";
import { getDungeonSurfaces } from "./dungeonSurfaces";
import {
  getCounterPlacement,
  type CounterPlacement, type ShelfId, type ShelfPlacement,
} from "./shopLayout.ts";
import {shelfServicePoint,shopFurnitureDefinition,turnShopOffset,SHELF_SLOT_COUNT,shelfSlotLocalZ} from "./furnitureRegistry.ts";

interface ShelfGroup {
  root: TransformNode;
}

/** Shelf inventory IDs never change when a physical shelf is moved or rotated. */
export class Shop {
  readonly slotMeshes = new Map<Mesh, Slot>();
  private readonly slotById = new Map<string, Mesh>();
  private readonly slotBaseMaterial: StandardMaterial;
  private readonly itemVisuals = new Map<string, Mesh[]>();
  private stockTemplates: ReadonlyMap<ItemId, Mesh> | null = null;
  private readonly shelves = new Map<ShelfId, ShelfGroup>();
  private selectedItemId: ItemId = SHELF_GOODS[0].id;

  constructor(
    private readonly scene: Scene,
    private readonly store: GameStore,
  ) {
    this.slotBaseMaterial = new StandardMaterial("shelf-slot-wood", scene);
    this.slotBaseMaterial.diffuseColor = new Color3(0.33, 0.26, 0.19);
    this.slotBaseMaterial.specularColor = new Color3(0.07, 0.06, 0.04);

    this.createShelves();
    this.syncPlacements();
    this.refresh();
    let priorLayout=this.store.state.shopLayout;
    let priorSlots=this.store.state.shopEconomy.slots;
    this.store.subscribe(() => {
      const {shopLayout,shopEconomy}=this.store.state;
      const moved=priorLayout!==shopLayout;
      const changedStock=priorSlots!==shopEconomy.slots;
      if(!moved&&!changedStock)return; // World-clock ticks cannot rebuild a shelf.
      priorLayout=shopLayout;
      priorSlots=shopEconomy.slots;
      if(moved){
        // New saved instances have real meshes before dependent consumers
        // observe the changed store geometry.
        this.createShelves();
        this.syncPlacements();
      }
      this.refresh();
    });
    // Load real GLBs independently of game-state readiness. Newly stocked
    // slots remain interactive while models load and are refreshed from the
    // latest authoritative inventory after the last asset is available.
    void getShopStockTemplates(scene).then(templates => {
      this.stockTemplates = templates;
      for (const slot of this.store.state.shopEconomy.slots) this.updateSlot(slot);
    }).catch(error => console.error("Shop stock GLB loading failed", error));
  }

  select(itemId: ItemId): void { if(isShelfGood(itemId))this.selectedItemId = itemId; }
  stock(slot: Slot, units = 1): string {
    return this.store.transfer(slot.id, this.selectedItemId, "stock", units);
  }
  remove(slot: Slot, units = 1): string {
    return this.store.transfer(slot.id, slot.itemId ?? this.selectedItemId, "remove", units);
  }

  /** For subsequent shopping/navigation AI: shelf position, never a hard-coded aisle. */
  shelfAccessPoint(slot: Slot): Vector3 {
    const placement = this.store.state.shopLayout.shelves.find(p=>p.id===slot.shelfId)!;
    const point=shelfServicePoint(placement,slot.index);
    return new Vector3(point.x,0,point.z);
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
      const offset=turnShopOffset(x,z,p.rotation);
      mesh.position.set(p.x+offset.x,y,p.z+offset.z);
      mesh.rotation.y=p.rotation*Math.PI/2;
    };
    put("checkout-counter",0,0.42,0);
    put("counter-top",0,0.90,0);
    const register=shopFurnitureDefinition("counter").register;
    put("register-base",register.x,1.05,register.z);
    put("cash-register",register.x,1.22,register.z);

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
    const activeIds=new Set(this.store.state.shopLayout.shelves.map(shelf=>shelf.id));
    // New Game / imported campaign may REMOVE an instanced shelf again.
    // Retire its collision meshes and slot mappings before refresh tries to
    // read stock that no longer belongs to the current saved layout.
    for(const [id,group] of this.shelves){
      if(activeIds.has(id))continue;
      for(const [mesh,slot] of this.slotMeshes){
        if(slot.shelfId!==id)continue;
        this.slotMeshes.delete(mesh);
        this.slotById.delete(slot.id);
        this.itemVisuals.delete(slot.id);
      }
      group.root.dispose();
      this.shelves.delete(id);
    }
    for (const {id:shelfId} of this.store.state.shopLayout.shelves) {
      if(this.shelves.has(shelfId))continue;
      const root = new TransformNode(shelfId+"-root", this.scene);
      const material = getDungeonSurfaces(this.scene).wood;
      const back = MeshBuilder.CreateBox(shelfId+"-back",{
        width:0.15,height:1.5,depth:3.0,
      },this.scene);
      back.parent = root;
      back.position.set(0,0.85,0);
      back.material = material;
      back.checkCollisions = true;
      back.isPickable = true; // Looking at the frame, not only stock slots, selects the shelf for P
      const plank=MeshBuilder.CreateBox(shelfId+"-plank",{
        width:1.0,height:0.14,depth:3.0,
      },this.scene);
      plank.parent=root;
      plank.position.set(0.42,0.52,0);
      plank.material=material;
      plank.checkCollisions=true;
      plank.isPickable=true;

      this.shelves.set(shelfId,{root});
      for(let index=0;index<SHELF_SLOT_COUNT;index++){
        const slot=this.store.state.shopEconomy.slots.find(({id})=>
          id===`${shelfId}-slot-${index+1}`)!;
        const mesh=MeshBuilder.CreateBox(slot.id,{
          width:0.65,height:0.12,depth:0.61,
        },this.scene);
        mesh.parent=root;
        mesh.position.set(0.44,0.66,shelfSlotLocalZ(index));
        mesh.material=this.slotBaseMaterial;
        mesh.checkCollisions=true;
        mesh.isPickable=true;
        mesh.metadata={kind:"shelf-slot",slotId:slot.id};
        this.slotMeshes.set(mesh,slot);
        this.slotById.set(slot.id,mesh);
        this.createSlotLabel(slot,root);
        this.updateSlot(slot);
      }
    }
  }

  private createSlotLabel(slot:Slot,root:TransformNode):void {
    const label=MeshBuilder.CreatePlane(slot.id+"-number",{
      width:0.24,height:0.2,
    },this.scene);
    label.parent=root;
    label.position.set(0.78,0.92,shelfSlotLocalZ(slot.index));
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
    // The slot's pickable wooden pad stays the exact same collision/interaction
    // target. Items are purely visual meshes, never obstacles for customers.
    mesh.material=this.slotBaseMaterial;
    for(const visual of this.itemVisuals.get(slot.id)??[])visual.dispose();
    const visuals:Mesh[]=[];
    if(slot.itemId && this.stockTemplates){
      const root=this.shelves.get(slot.shelfId as ShelfId)!.root;
      const positions=[
        {x:.29,z:-.16},{x:.29,z:.16},
        {x:.58,z:-.19},{x:.58,z:0},{x:.58,z:.19},
      ];
      for(let count=0;count<slot.quantity;count++){
        const template=this.stockTemplates.get(slot.itemId);
        if(!template)throw new Error("Missing stock GLB: "+slot.itemId);
        const visual=cloneShopStockModel(template,slot.id+"-item-"+count);
        visual.parent=root;
        if(slot.itemId==="iron-sword"){
          // Real blades lie in a short, tidy stack; never poke through the
          // neighboring slot or obstruct the service side of the shelf.
          visual.position.set(.43,.735+count*.016,
            shelfSlotLocalZ(slot.index)+(count-2)*.09);
          visual.scaling.setAll(.87);
        }else{
          const pose=positions[count]!;
          visual.position.set(pose.x,.735,shelfSlotLocalZ(slot.index)+pose.z);
          visual.scaling.setAll(slot.itemId==="bread"?.76:.87);
          visual.rotation.y=count%2===0?-.09:.12;
        }
        visuals.push(visual);
      }
    }
    this.itemVisuals.set(slot.id,visuals);
  }
}
