import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { reconcileVisitors, shouldLeaveShopVisual, type GateSide, type VisitorRole, type VisitorSnapshot } from "./npcVisitors";
import { salesByHero, type SaleReceipt } from "./saleView.ts";
import { heroPortraitIndex } from "./heroIdentity.ts";
import { createHeroVisual, setHeroVisualEquipment, type HeroVisual } from "./heroVisual.ts";
import type { ShoppingIntent, ShoppingInterest } from "./shopperIntents.ts";
import { ITEMS } from "./economy.ts";
import type { ShopCart } from "./shopCarts.ts";
import { checkoutQueueIndex, checkoutQueuePoints } from "./checkoutQueue.ts";
import { gateTravelLane, idleShopPositions, interruptedDepartureRoute, nextEntranceSpawnZ } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear } from "./shopperNavigation.ts";
import type { ShopLayout } from "./shopLayout.ts";
import type { Shop } from "./shop.ts";

interface NpcVisual {
  readonly root: TransformNode;
  readonly arms: readonly TransformNode[];
  readonly legs: readonly TransformNode[];
  readonly torso: Mesh;
  readonly model: HeroVisual;
  visitor: VisitorSnapshot;
  phase: "entering" | "browsing" | "considering" | "queueing" | "leaving";
  intent:ShoppingIntent|null;
  intentKey:string;
  targetIndex:number;
  toQueue:boolean;
  heldLines:readonly ShoppingInterest[];
  heldMeshes:Mesh[];
  heldKey:string;
  route: Vector3[];
  waypoint: number;
  slot: number;
  elapsed: number;
  wait: number;
  browseSide: number;
  animationTime: number;
  blockedSeconds:number;
  gateSide: GateSide;
  readonly labelTexture: DynamicTexture;
  readonly labelMesh: Mesh;
  saleTag: Mesh | null;
  saleSeconds: number;
}

const WALK_SPEED = 2.1;
const PERSONAL_SPACE = 0.54;
const DOOR_CLOSED_Y = 0.9;
const DOOR_OPEN_Y = 3.8;
const DOOR_PASSAGE_CLEAR_Y = 3.4;
const CORRIDOR_X: Record<GateSide, number> = { level4: -4, level6: 4 };
const CORRIDOR_INNER_Z = 6.0;
const CORRIDOR_OUTER_Z = 13;

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  result.specularColor = new Color3(0.12, 0.12, 0.12);
  return result;
}

/** Draw the original portrait tile beside the persistent hero's name/level. */
function paintIdentity(npc: NpcVisual, atlas: HTMLImageElement): void {
  const ctx = npc.labelTexture.getContext();
  ctx.clearRect(0, 0, 640, 160);
  ctx.fillStyle = "#211910";
  ctx.fillRect(0, 0, 640, 160);
  setHeroVisualEquipment(npc.model, npc.visitor.equipment ?? { weapon: null, armor: null });
  const index = heroPortraitIndex(npc.visitor.id);
  ctx.save();
  ctx.beginPath();
  ctx.arc(76, 80, 62, 0, Math.PI * 2);
  ctx.clip();
  if (atlas.complete && atlas.naturalWidth > 0) {
    const w = atlas.naturalWidth / 5;
    const h = atlas.naturalHeight / 5;
    const inset = Math.min(w, h) * 0.06;
    ctx.drawImage(atlas, (index % 5) * w + inset, Math.floor(index / 5) * h + inset,
      w - 2 * inset, h - 2 * inset, 14, 18, 124, 124);
  } else {
    ctx.fillStyle = "#52634d";
    ctx.fillRect(14, 18, 124, 124);
    ctx.fillStyle = "#fff0cb";
    ctx.font = "bold 62px sans-serif";
    ctx.fillText(npc.visitor.name.charAt(0), 52, 101);
  }
  ctx.restore();
  ctx.strokeStyle = "#d6ae67";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(76, 80, 62, 0, Math.PI * 2);
  ctx.stroke();
  const displayName = npc.visitor.displayName ?? npc.visitor.name;
  const level = npc.visitor.level ?? 1;
  ctx.fillStyle = "#fff0cb";
  ctx.font = "bold 35px sans-serif";
  ctx.fillText(displayName + " · Lv" + level, 155, 76, 475);
  ctx.fillStyle = "#e0bc88";
  ctx.font = "25px sans-serif";
  ctx.fillText(npc.visitor.role, 157, 120);
  npc.labelTexture.update();
  npc.root.metadata.displayName = displayName;
  npc.root.metadata.level = level;
  npc.root.metadata.portraitIndex = index;
  npc.root.metadata.portraitReady = atlas.complete && atlas.naturalWidth > 0;
}

function createHumanoid(scene: Scene, visitor: VisitorSnapshot, slot: number, position: Vector3, atlas: HTMLImageElement): NpcVisual {
  const model = createHeroVisual(scene, {
    id: visitor.id, role: visitor.role,
    equipment: visitor.equipment ?? { weapon: null, armor: null },
  }, `npc-${visitor.id}`);
  const { root, arms, legs, torso } = model;
  root.position.copyFrom(position);
  
  const label = MeshBuilder.CreatePlane(`npc-${visitor.id}-label`, { width: 1.05, height: 0.263 }, scene);
  label.parent = root;
  label.position.y = 2.22;
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.isPickable = false;
  label.checkCollisions = false;
  const texture = new DynamicTexture(`npc-${visitor.id}-label-texture`, { width: 640, height: 160 }, scene, false);
  texture.hasAlpha = true;
  const labelMaterial = material(scene, `npc-${visitor.id}-label-material`, Color3.White());
  labelMaterial.diffuseTexture = texture;
  labelMaterial.emissiveColor = new Color3(0.8, 0.8, 0.8);
  labelMaterial.disableLighting = true;
  labelMaterial.backFaceCulling = false;
  label.material = labelMaterial;

  const visual: NpcVisual = {
    root, arms, legs, torso, model, visitor, phase: "entering", route: [], waypoint: 0, slot,
    elapsed: 0, wait: 0, browseSide: Number(visitor.id.replace(/\D/g, "")) % 2 ? -1 : 1, animationTime: 0, blockedSeconds:0,
    gateSide: visitor.entranceGate ?? "level4",
    intent:null,intentKey:"",targetIndex:0,toQueue:false,
    heldLines:[],heldMeshes:[],heldKey:"",
    labelTexture: texture, labelMesh: label,
    saleTag: null, saleSeconds: 0,
  };
  root.metadata = {
    ...root.metadata,
    adventurerId: visitor.id, name: visitor.name, role: visitor.role,
    phase: visual.phase, simulationStatus: visitor.status, gateSide: visual.gateSide,
  };
  paintIdentity(visual, atlas);
  return visual;
}

export class NpcVisualSystem {
  private readonly npcs = new Map<string, NpcVisual>();
  private readonly portraits = new Image();
  private readonly doors: Record<GateSide, Mesh | null>;
  private readonly doorY: Record<GateSide, number> = { level4: DOOR_CLOSED_Y, level6: DOOR_CLOSED_Y };
  private layout:ShopLayout|null=null;
  private shop:Shop|null=null;
  private onPickUp:((heroId:string,slotId:string)=>boolean)|null=null;
  private readonly shelfOwners=new Map<string,string>();
  private carts:readonly ShopCart[]=[];

  constructor(private readonly scene: Scene) {
    this.portraits.addEventListener("load", () => {
      for (const npc of this.npcs.values()) paintIdentity(npc, this.portraits);
    });
    this.portraits.src = import.meta.env.BASE_URL + "assets/hero-portraits.webp";
    this.doors = {
      level4: scene.getMeshByName("level-4-barrier") as Mesh | null,
      level6: scene.getMeshByName("level-6-barrier") as Mesh | null,
    };
    scene.onBeforeRenderObservable.add(this.update);
  }

  reconcile(current: readonly VisitorSnapshot[], previous: readonly VisitorSnapshot[]): void {
    const changes = reconcileVisitors(previous, current);
    const currentById = new Map(current.map((visitor) => [visitor.id, visitor]));
    for (const [id, visual] of this.npcs) {
      if (!currentById.has(id) || currentById.get(id)?.status === "dead") this.dispose(visual);
    }
    const usedSlots = new Set([...this.npcs.values()].map(({ slot }) => slot));
    for (const visitor of changes.entering) {
      const existing = this.npcs.get(visitor.id);
      if (existing) {
        existing.visitor = visitor;
        paintIdentity(existing, this.portraits);
        this.beginEntering(existing, existing.slot, false);
      } else {
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        usedSlots.add(slot);
        // Concurrent arrivals have distinct lateral lanes and spawn depth.
        // Never create two physical models at the same position.
        const gate=visitor.entranceGate??"level4";
        const laneX=gateTravelLane(gate,"entering");
        const spawnZ=nextEntranceSpawnZ(laneX,[...this.npcs.values()].map(n=>({
          x:n.root.position.x,z:n.root.position.z,
        })));
        const visual=createHumanoid(this.scene,visitor,slot,
          new Vector3(laneX,0,spawnZ),this.portraits);
        this.npcs.set(visitor.id, visual);
        this.beginEntering(visual, slot, true);
      }
    }
    for (const visitor of changes.staying) {
      const visual = this.npcs.get(visitor.id);
      if (visual) {
        visual.visitor = visitor;
        paintIdentity(visual, this.portraits);
        visual.root.metadata.simulationStatus = visitor.status;
        if (visual.phase === "leaving") this.beginEntering(visual, visual.slot, false);
      } else {
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        usedSlots.add(slot);
        // Concurrent arrivals have distinct lateral lanes and spawn depth.
        // Never create two physical models at the same position.
        const gate=visitor.entranceGate??"level4";
        const laneX=gateTravelLane(gate,"entering");
        const spawnZ=nextEntranceSpawnZ(laneX,[...this.npcs.values()].map(n=>({
          x:n.root.position.x,z:n.root.position.z,
        })));
        const visual=createHumanoid(this.scene,visitor,slot,
          new Vector3(laneX,0,spawnZ),this.portraits);
        this.npcs.set(visitor.id, visual);
        this.beginEntering(visual, slot, true);
      }
    }
    for (const visitor of changes.leaving) {
      const visual = this.npcs.get(visitor.id);
      if (visual) {
        visual.visitor = currentById.get(visitor.id) ?? visitor;
        paintIdentity(visual, this.portraits);
        visual.root.metadata.simulationStatus = visual.visitor.status;
        this.beginLeaving(visual);
      }
    }
  }

  /** Visual preview derived from the authoritative purchase engine.
   * Never takes stock, changes gold or commits a sale.
   */
  setShoppingIntents(
    plans:ReadonlyMap<string,ShoppingIntent>,layout:ShopLayout,shop:Shop,
    carts:readonly ShopCart[],
    onPickUp:(heroId:string,slotId:string)=>boolean,
  ):void {
    const furnitureMoved=this.layout!==null&&(
      JSON.stringify(this.layout.counter)!==JSON.stringify(layout.counter)||
      JSON.stringify(this.layout.shelves)!==JSON.stringify(layout.shelves));
    this.layout=layout;
    this.shop=shop;
    this.onPickUp=onPickUp;
    this.carts=carts;
    const cartByHero=new Map(carts.map(cart=>[cart.heroId,cart]));
    const queueIds=carts.filter(cart=>cart.lines.length>0).map(cart=>cart.heroId);
    const queuePoints=checkoutQueuePoints(layout,{x:0,z:-1},queueIds.length);
    for(const npc of this.npcs.values()){
      const isShopping=!shouldLeaveShopVisual(npc.visitor.status);
      const held=isShopping?(cartByHero.get(npc.visitor.id)?.lines??[]):[];
      const changed=this.syncCarriedProducts(npc,held);
      // A departing visitor has just paid by the confirmed Day Tick. Clear
      // the unpaid basket immediately, and show their updated true inventory.
      if(!isShopping){
        if(changed)paintIdentity(npc,this.portraits);
        // Leaving visitors keep their route across regular economy refreshes,
        // but must replan when moved furniture would intersect a cached path.
        // Past the inner gate they are already beyond any movable furniture.
        if(npc.phase==="leaving"&&(
          npc.root.metadata.shoppingPhase==="blocked-exit"||
          (furnitureMoved&&npc.root.position.z<=CORRIDOR_INNER_Z)))
          this.beginLeaving(npc);
        continue;
      }
      const plan=plans.get(npc.visitor.id)??null;
      const queueIndex=checkoutQueueIndex(carts,npc.visitor.id);
      const key=JSON.stringify([plan?.items,plan?.reason,layout.shelves,layout.counter,held,queueIndex,queuePoints[queueIndex]]);
      if(key===npc.intentKey)continue;
      npc.intent=plan;
      npc.intentKey=key;
      npc.targetIndex=0;
      npc.root.metadata.shoppingReason=plan?.reason??"no-need";
      npc.root.metadata.shoppingTargets=plan?.items.map(x=>x.slotId)??[];
      if(["browsing","queueing","considering"].includes(npc.phase))
        this.beginBrowsing(npc);
      paintIdentity(npc,this.portraits);
    }
  }

  /** Physical register admission, checked immediately before the transaction. */
  readyCheckoutHeroId():string|null {
    const head=this.carts.find(cart=>cart.lines.length>0);
    if(!head||!this.layout)return null;
    const npc=this.npcs.get(head.heroId);
    if(!npc||npc.visitor.status!=="at-shop"||npc.phase!=="queueing"||
       npc.root.metadata.shoppingPhase!=="awaiting-checkout")return null;
    const point=checkoutQueuePoints(this.layout,{x:0,z:-1},1)[0];
    if(!point||Math.hypot(npc.root.position.x-point.x,
       npc.root.position.z-point.z)>0.3)return null;
    return head.heroId;
  }

  /** Physically carried items use the same item IDs/colors as shelf goods.
   * Meshes belong to the right-hand socket of the shared hero model.
   * This never equips unpaid armor or swords as bought equipment.
   */
  private syncCarriedProducts(
    npc:NpcVisual,lines:readonly ShoppingInterest[],
  ):boolean {
    const key=JSON.stringify(lines);
    if(key===npc.heldKey)return false;
    for(const mesh of npc.heldMeshes){
      const mat=mesh.material;
      mesh.dispose();
      mat?.dispose();
    }
    npc.heldMeshes=[];
    npc.heldKey=key;
    npc.heldLines=lines;
    let position=0;
    for(const line of lines){
      const item=ITEMS.find(entry=>entry.id===line.itemId);
      if(!item)continue;
      const mesh=item.kind==="healing"||item.id==="mana-potion"
        ? MeshBuilder.CreateCylinder("npc-carried-"+npc.visitor.id+"-"+position,
          {height:0.27,diameter:0.2},this.scene)
        : item.kind==="food"
        ? MeshBuilder.CreateSphere("npc-carried-"+npc.visitor.id+"-"+position,
          {diameter:0.27},this.scene)
        : MeshBuilder.CreateBox("npc-carried-"+npc.visitor.id+"-"+position,
          {size:0.27},this.scene);
      mesh.parent=npc.arms[1];
      mesh.position.set(0.08+0.07*(position%2),-0.50-0.15*Math.floor(position/2),
        -0.22-0.16*(position%2));
      mesh.material=material(this.scene,
        "npc-carried-"+npc.visitor.id+"-"+position+"-mat",
        Color3.FromHexString(item.color));
      mesh.isPickable=false;
      mesh.checkCollisions=false;
      npc.heldMeshes.push(mesh);
      position++;
    }
    npc.root.metadata.cartUnits=lines.reduce((sum,line)=>sum+line.quantity,0);
    npc.root.metadata.cartTotal=lines.reduce((sum,line)=>sum+line.subtotal,0);
    npc.root.metadata.cartPaid=false;
    npc.root.metadata.cartItemIds=lines.map(line=>line.itemId);
    npc.root.metadata.carriedMeshes=npc.heldMeshes.length;
    return true;
  }

  /** Cosmetic, transient feedback for already-booked purchases. Never writes to GameStore. */
  showSales(receipts: readonly SaleReceipt[]): void {
    for (const [heroId, purchase] of salesByHero(receipts)) {
      const npc = this.npcs.get(heroId);
      if (!npc) continue;
      this.clearSaleTag(npc);
      const tag = MeshBuilder.CreatePlane("npc-sale-" + heroId, { width: 2.1, height: 0.40 }, this.scene);
      tag.parent = npc.root;
      tag.position.y = 2.91;
      tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
      tag.checkCollisions = false;
      tag.isPickable = false;
      const texture = new DynamicTexture("sale-label-" + heroId, { width: 512, height: 120 }, this.scene, false);
      texture.drawText("SOLD " + purchase.units + "  +" + purchase.gold + "g", null, 82,
        "bold 46px sans-serif", "#e8ffb6", "#1d3828", true);
      const saleMaterial = material(this.scene, "sale-material-" + heroId, Color3.White());
      saleMaterial.diffuseTexture = texture;
      saleMaterial.disableLighting = true;
      saleMaterial.emissiveColor = Color3.White();
      saleMaterial.backFaceCulling = false;
      tag.material = saleMaterial;
      npc.saleTag = tag;
      npc.saleSeconds = 8;
      npc.root.metadata.lastSaleGold = purchase.gold;
    }
  }

  private clearSaleTag(npc: NpcVisual): void {
    if (npc.saleTag) {
      const saleMaterial = npc.saleTag.material;
      npc.saleTag.dispose();
      saleMaterial?.dispose(true, true);
      npc.saleTag = null;
    }
    npc.saleSeconds = 0;
  }

  private readonly update = (): void => {
    const delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.1);
    const open: Record<GateSide, boolean> = { level4: false, level6: false };
    for (const npc of this.npcs.values()) {
      npc.animationTime += delta;
      const cameraPosition = this.scene.activeCamera?.globalPosition;
      if (cameraPosition) {
        const distance = Vector3.Distance(cameraPosition, npc.root.getAbsolutePosition());
        npc.labelMesh.isVisible = distance < 9;
        npc.labelMesh.scaling.setAll(distance > 5 ? 0.78 : 1);
      }
      if (npc.saleSeconds > 0) {
        npc.saleSeconds -= delta;
        if (npc.saleSeconds <= 0) this.clearSaleTag(npc);
      }
      if (npc.phase === "entering" || npc.phase === "leaving") {
        open[npc.gateSide] = true;
        // A hero switched to an L6 departure while still physically in the
        // Level 4 approach. Open that gate too until they return to the shop.
        if (npc.root.position.z > CORRIDOR_INNER_Z && npc.root.position.x < 0) open.level4 = true;
        if (npc.root.position.z > CORRIDOR_INNER_Z && npc.root.position.x > 0) open.level6 = true;
      }
      if(npc.phase==="queueing" &&
        npc.root.metadata.shoppingPhase==="waiting-for-shelf" &&
        npc.visitor.status==="at-shop"){
        npc.wait-=delta;
        if(npc.wait<=0&&npc.route[npc.waypoint]===undefined)
          this.beginBrowsing(npc);
      }
      if(npc.phase==="considering"){
        npc.wait-=delta;
        if(npc.wait<=0){
          const item=npc.intent?.items[npc.targetIndex];
          // Commit a reservation only at the shelf, after the inspection pause.
          // Store notifications synchronously re-plan remaining shopping needs.
          if(item&&this.onPickUp?.(npc.visitor.id,item.slotId)){
            // Store notifications synchronously update cart meshes and route
            // planning. Do not overwrite their fresh phase metadata here.
          }else{
            npc.targetIndex++;
            this.beginBrowsing(npc);
          }
        }
      }else if(npc.phase!=="queueing"||
        (npc.root.metadata.shoppingPhase==="waiting-for-shelf"&&
          npc.route[npc.waypoint]!==undefined)){
        const isMovingThroughGate = (npc.phase === "entering" || npc.phase === "leaving") &&
          npc.root.position.z > 11.3;
        const physicalSide: GateSide = npc.root.position.x < 0 ? "level4" : "level6";
        if (!isMovingThroughGate || this.doorY[physicalSide] >= DOOR_PASSAGE_CLEAR_Y) {
          this.move(npc, delta);
        }
      }
      this.animate(npc);
    }
    for (const gate of ["level4", "level6"] as const) {
      const target = open[gate] ? DOOR_OPEN_Y : DOOR_CLOSED_Y;
      const y = this.doorY[gate];
      this.doorY[gate] += Math.sign(target - y) * Math.min(Math.abs(target - y), delta * 4);
      if (this.doors[gate]) this.doors[gate]!.position.y = this.doorY[gate];
    }
  };

  private releaseShelf(npc:NpcVisual):void {
    for(const [slot,owner] of this.shelfOwners){
      if(owner===npc.visitor.id)this.shelfOwners.delete(slot);
    }
  }

  private beginEntering(npc: NpcVisual, slot: number, fromOutside: boolean): void {
    this.releaseShelf(npc);
    npc.slot = slot;
    npc.phase = "entering";
    npc.gateSide = npc.visitor.entranceGate ?? "level4";
    const x = npc.root.position.x;
    const gateX = gateTravelLane(npc.gateSide,"entering");
    // Keep the same x lane until inside the shop; only then shift laterally.
    npc.route = fromOutside
      ? [new Vector3(gateX, 0, CORRIDOR_INNER_Z)]
      : interruptedDepartureRoute(npc.gateSide,
          {x,z:npc.root.position.z},CORRIDOR_INNER_Z,CORRIDOR_OUTER_Z)
          .map(point=>new Vector3(point.x,0,point.z));
    npc.waypoint = 0;
    npc.wait = 0;
    npc.blockedSeconds=0;
    npc.root.metadata.phase = npc.phase;
    npc.root.metadata.gateSide = npc.gateSide;
    npc.root.metadata.simulationStatus = npc.visitor.status;
  }

  private beginLeaving(npc: NpcVisual): void {
    this.releaseShelf(npc);
    npc.phase = "leaving";
    npc.gateSide = npc.visitor.status === "expedition" ? "level6" : "level4";
    const gateX = gateTravelLane(npc.gateSide,"leaving");
    // Keep the current corridor lane when outside: crossing lateral corridor
    // walls at z>7 is forbidden. Inside the shop use furniture-aware routing.
    const mustEnterShop=npc.root.position.z>CORRIDOR_INNER_Z+0.25;
    const from=mustEnterShop?
      {x:npc.root.position.x,z:CORRIDOR_INNER_Z}:
      {x:npc.root.position.x,z:npc.root.position.z};
    const possibleLanes=[gateX];
    const chosen=possibleLanes.map(x=>({
      x,route:this.layout?pathToShopGoal(from,{
        x,z:CORRIDOR_INNER_Z,
      },this.layout):null,
    })).find(entry=>entry.route!==null);
    if(this.layout&&!chosen){
      // Never fall back to a straight wall-crossing route.
      npc.route=[];
      npc.waypoint=0;
      npc.root.metadata.shoppingPhase="blocked-exit";
      return;
    }
    const exitX=chosen?.x??gateX;
    npc.route=[
      ...(mustEnterShop?[new Vector3(from.x,0,from.z)]:[]),
      ...(chosen?.route?.waypoints.map(point=>
        new Vector3(point.x,0,point.z))??[
          new Vector3(exitX,0,CORRIDOR_INNER_Z)]),
      new Vector3(exitX,0,CORRIDOR_OUTER_Z),
    ];
    npc.waypoint = 0;
    npc.root.metadata.phase = npc.phase;
    npc.root.metadata.gateSide = npc.gateSide;
  }

  private beginBrowsing(npc:NpcVisual):void {
    this.releaseShelf(npc);
    const item=npc.intent?.items[npc.targetIndex];
    const slot=item&&this.shop?[...this.shop.slotMeshes.values()]
      .find(s=>s.id===item.slotId):undefined;
    const origin={x:npc.root.position.x,z:npc.root.position.z};
    if(item&&slot&&this.layout&&this.shop){
      const pointForShelf=this.shop.shelfAccessPoint(slot);
      const owner=this.shelfOwners.get(item.slotId);
      if(owner&&owner!==npc.visitor.id){
        const waitingRoutes=Array.from({length:this.npcs.size+5},(_,slot)=>{
          const target=this.queuePosition(slot);
          const route=target?pathToShopGoal(origin,target,this.layout!):null;
          const point=route?.waypoints.at(-1)??target;
          const clearOfShelf=!!point&&Math.hypot(point.x-pointForShelf.x,
            point.z-pointForShelf.z)>=PERSONAL_SPACE*2;
          const clearOfVisitors=!!point&&[...this.npcs.values()].every(other=>
            other===npc||Math.hypot(point.x-other.root.position.x,
              point.z-other.root.position.z)>=PERSONAL_SPACE*1.5);
          return route&&clearOfShelf&&clearOfVisitors?{route}:null;
        }).filter((candidate):candidate is {route:NonNullable<ReturnType<typeof pathToShopGoal>>} =>
          candidate!==null)
          .sort((a,b)=>a.route.length-b.route.length);
        const waitingRoute=waitingRoutes[0]?.route;
        npc.phase="queueing";
        npc.route=waitingRoute?.waypoints.map(p=>new Vector3(p.x,0,p.z))??[];
        npc.waypoint=0;
        npc.wait=0.6+(npc.slot%4)*0.12;
        npc.root.metadata.shoppingPhase="waiting-for-shelf";
        npc.root.metadata.shoppingTargetSlot=item.slotId;
        npc.root.metadata.phase=npc.phase;
        return;
      }
      const path=pathToShopGoal(origin,{x:pointForShelf.x,z:pointForShelf.z},this.layout);
      if(path){
        this.shelfOwners.set(item.slotId,npc.visitor.id);
        npc.phase="browsing";npc.toQueue=false;
        npc.route=path.waypoints.map(p=>new Vector3(p.x,0,p.z));
        npc.waypoint=0;
        npc.root.metadata.shoppingTargetSlot=item.slotId;
        npc.root.metadata.shoppingPhase="approaching-shelf";
        npc.root.metadata.phase=npc.phase;
        paintIdentity(npc,this.portraits);
        return;
      }
      npc.root.metadata.shoppingPhase="unreachable-shelf";
    }
    const checkoutIndex=checkoutQueueIndex(this.carts,npc.visitor.id);
    const queuePoints=this.layout?checkoutQueuePoints(this.layout,{x:0,z:-1},this.carts.length):[];
    const target=checkoutIndex>=0?queuePoints[checkoutIndex]:this.queuePosition(npc.slot);
    if(!target){
      npc.phase="queueing";npc.route=[];npc.waypoint=0;
      npc.root.metadata.shoppingPhase=checkoutIndex>=0
        ?"checkout-capacity-full":"idle-capacity-full";
      npc.root.metadata.checkoutQueueIndex=checkoutIndex;
      npc.root.metadata.phase=npc.phase;
      return;
    }
    const route=this.layout?pathToShopGoal(origin,
      {x:target.x,z:target.z},this.layout):null;
    npc.phase="browsing";npc.toQueue=true;
    npc.route=(route?.waypoints??[]).map(p=>new Vector3(p.x,0,p.z));
    npc.waypoint=0;
    npc.root.metadata.shoppingTargetSlot=null;
    npc.root.metadata.shoppingPhase=checkoutIndex>=0
      ? (route?"walking-to-checkout":"checkout-route-blocked")
      : (route?"walking-to-wait":"idle-route-blocked");
    npc.root.metadata.checkoutQueueIndex=checkoutIndex;
    npc.root.metadata.phase=npc.phase;
    paintIdentity(npc,this.portraits);
  }

  private queuePosition(slot:number):Vector3|null {
    if(!this.layout)return null;
    const point=idleShopPositions(this.layout,100)[slot];
    return point?new Vector3(point.x,0,point.z):null;
  }

  private move(npc: NpcVisual, delta: number): void {
    const target = npc.route[npc.waypoint];
    if (!target) {
      if (npc.phase === "entering") {
        this.beginBrowsing(npc);
      }else if(npc.phase==="browsing"){
        if(npc.toQueue){
          if(npc.root.metadata.shoppingPhase==="checkout-route-blocked"||
            npc.root.metadata.shoppingPhase==="idle-route-blocked")return;
          npc.phase="queueing";
          npc.root.metadata.shoppingPhase=checkoutQueueIndex(this.carts,npc.visitor.id)>=0
            ? "awaiting-checkout":"waiting-for-next-day";
        }else{
          npc.phase="considering";
          npc.wait=1.1+(npc.slot%3)*0.35;
          npc.root.metadata.shoppingPhase="considering-item";
        }
        npc.root.metadata.phase=npc.phase;
      }else if(npc.phase==="leaving"){
        // Only discard a visitor after they have physically passed the gate.
        // A currently impassable route must not make them vanish in the shop.
        if(npc.root.position.z>=CORRIDOR_OUTER_Z-0.12)this.dispose(npc);
        else npc.root.metadata.shoppingPhase="blocked-exit";
      }
      return;
    }
    const dx = target.x - npc.root.position.x;
    const dz = target.z - npc.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.04) {
      npc.root.position.x = target.x;
      npc.root.position.z = target.z;
      npc.waypoint += 1;
      return;
    }
    npc.root.rotation.y = Math.atan2(dx, dz);
    const step = Math.min(distance, WALK_SPEED * delta);
    const x=npc.root.position.x+dx/distance*step;
    const z=npc.root.position.z+dz/distance*step;
    // A counter can be moved while this visitor is walking. Check each actual
    // movement segment, not only the cached route from the last state refresh.
    // Replan from the visitor's physical position before crossing new furniture.
    if(npc.phase==="leaving"&&this.layout&&z<=6.6){
      // Corridor coordinates are outside the indoor navigation grid. Clip a
      // crossing step to the shop boundary instead of treating its outside
      // starting point as an obstacle and trapping the visitor forever.
      const current={x:npc.root.position.x,z:npc.root.position.z};
      const fraction=current.z>6.6
        ?(current.z-6.6)/(current.z-z):0;
      const indoorStart={x:current.x+(x-current.x)*fraction,
        z:current.z>6.6?6.6:current.z};
      if(!shopSegmentClear(indoorStart,{x,z},this.layout)){
        this.beginLeaving(npc);
        return;
      }
    }
    const blocked=(px:number,pz:number)=>[...this.npcs.values()]
      .some(other=>other!==npc&&Math.hypot(
        px-other.root.position.x,pz-other.root.position.z)<PERSONAL_SPACE);
    if(blocked(x,z)){
      npc.blockedSeconds+=delta;
      npc.root.metadata.blockedSeconds=npc.blockedSeconds;
      if(npc.blockedSeconds>3 && npc.phase==="browsing"){
        npc.blockedSeconds=0;
        this.beginBrowsing(npc);
        return;
      }
      // In the narrow gates, wait behind the visitor ahead. Side-stepping
      // into the opposite-direction lane would recreate the original jam.
      if((npc.phase==="entering"||npc.phase==="leaving") &&
          (npc.root.position.z>6.5||target.z>6.5))return;
      // Yield sideways rather than deadlock when two autonomous visitors meet.
      // Keep deviations inside the actual shop's walkable area.
      const sideStep=Math.max(0.08,step);
      const preferred=(npc.slot%2===0?1:-1);
      for(const direction of [preferred,-preferred]){
        const sx=npc.root.position.x-direction*dz/distance*sideStep;
        const sz=npc.root.position.z+direction*dx/distance*sideStep;
        const corridorOkay=sz<=6.6 ||
          Math.abs(sx-(sx<0?-4:4))<=0.78;
        if(!blocked(sx,sz)&&corridorOkay&&
          (!this.layout || sz>6.6 || !isObstructed({x:sx,z:sz},this.layout))){
          npc.root.position.x=sx;
          npc.root.position.z=sz;
          return;
        }
      }
      return;
    }
    npc.blockedSeconds=0;
    npc.root.position.x=x;
    npc.root.position.z=z;
  }

  private animate(npc: NpcVisual): void {
    const walking = npc.phase === "entering" || npc.phase === "leaving" ||
      (npc.phase === "browsing" && npc.route[npc.waypoint] !== undefined);
    const amplitude = walking ? 0.65 : 0.08;
    const swing = Math.sin(npc.animationTime * (walking ? 8 : 2)) * amplitude;
    npc.legs[0].rotation.x = swing;
    npc.legs[1].rotation.x = -swing;
    npc.arms[0].rotation.x = -swing * 0.7;
    npc.arms[1].rotation.x = swing * 0.7;
    npc.torso.position.y = 1.14 + Math.sin(npc.animationTime * 2) * (walking ? 0.025 : 0.01);
    npc.root.position.y = 0.6 * Math.cos(swing) - 0.6;
  }

  private dispose(npc: NpcVisual): void {
    this.releaseShelf(npc);
    this.clearSaleTag(npc);
    this.syncCarriedProducts(npc, []);
    npc.root.dispose(false, true);
    this.npcs.delete(npc.visitor.id);
  }
}
