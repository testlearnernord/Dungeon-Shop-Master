import type { Level5Room } from "./level5Room.ts";
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
import { RESTOCK_WAIT_SECONDS, restockWaitRemaining, shopperVisualAction, type ShoppingIntent, type ShoppingInterest } from "./shopperIntents.ts";
import { createNpcWishBubble, setNpcWishItem, updateNpcWishBubble, type NpcWishBubble } from "./npcWishBubble.ts";
import type { ItemId } from "./economy.ts";
import { ITEMS } from "./economy.ts";
import type { ShopCart } from "./shopCarts.ts";
import { checkoutQueueIndex, checkoutQueuePoints } from "./checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE, NPC_FINAL_WAYPOINT_RADIUS, NPC_SOFT_PASS_AFTER_SECONDS, NPC_GATE_SOFT_PASS_AFTER_SECONDS, inGateTrafficThroat, canFinishShopWaypoint, shopCrowdStep, entranceApproachRoute, gateFlowDirection, mustYieldAtGate, gateTravelLane, idleShopPositions, idleShopperBlocksRoute, nextEntranceSpawnZ, type GateTrafficActor } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear } from "./shopperNavigation.ts";
import { reserveRestockWaitingRoute } from "./restockWaitingPlaces.ts";
import { npcLocomotion } from "./npcLocomotion.ts";
import { reserveShelfWaitingRoute } from "./shelfWaitingPlaces.ts";
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
  idleYieldCooldown:number;
  restockSeconds:number|null;
  wishItem:ItemId|null;
  wishBubble:NpcWishBubble|null;
  gateSide: GateSide;
  readonly labelTexture: DynamicTexture;
  readonly labelMesh: Mesh;
  saleTag: Mesh | null;
  saleSeconds: number;
}

const WALK_SPEED = 2.1;
const PERSONAL_SPACE = NPC_CENTER_CLEARANCE;
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

/** Compact transparent nameplate: the persistent portrait, readable name,
 * role and actual health. No gameplay or inventory authority lives here. */
function paintIdentity(npc:NpcVisual,atlas:HTMLImageElement):void {
  const ctx=npc.labelTexture.getContext();
  ctx.clearRect(0,0,640,160);
  // One thin translucent identity strip instead of an opaque 640px slab.
  ctx.fillStyle="rgba(12,19,22,.68)";
  ctx.fillRect(8,10,624,132);
  ctx.strokeStyle="rgba(224,184,117,.58)";
  ctx.lineWidth=3;
  ctx.strokeRect(9,11,622,130);
  setHeroVisualEquipment(npc.model,npc.visitor.equipment??{weapon:null,armor:null});
  const index=heroPortraitIndex(npc.visitor.id);
  ctx.save();
  ctx.beginPath();
  ctx.arc(71,75,50,0,Math.PI*2);
  ctx.clip();
  if(atlas.complete&&atlas.naturalWidth>0){
    const w=atlas.naturalWidth/5,h=atlas.naturalHeight/5;
    const inset=Math.min(w,h)*.06;
    ctx.drawImage(atlas,(index%5)*w+inset,Math.floor(index/5)*h+inset,
      w-2*inset,h-2*inset,20,24,102,102);
  }else{
    ctx.fillStyle="#576a62";
    ctx.fillRect(20,24,102,102);
    ctx.fillStyle="#fff1d8";
    ctx.font="700 59px system-ui";
    ctx.fillText(npc.visitor.name.charAt(0),48,99);
  }
  ctx.restore();
  ctx.beginPath();ctx.arc(71,75,51,0,Math.PI*2);
  ctx.strokeStyle="#d8b77e";ctx.lineWidth=3;ctx.stroke();
  const name=npc.visitor.displayName??npc.visitor.name;
  const level=npc.visitor.level??1;
  const role=npc.visitor.role;
  ctx.fillStyle="#fff0d6";
  ctx.font="700 34px system-ui";
  ctx.fillText(name,147,62,340);
  ctx.fillStyle="#efcc94";ctx.font="650 22px system-ui";
  ctx.fillText("Lv "+level,525,61,92);
  const roles:{[key:string]:string}={tank:"#abd0e4",healer:"#aad6af",DPS:"#ebad8b"};
  ctx.fillStyle=roles[role]??"#dbc293";
  ctx.font="650 22px system-ui";
  ctx.fillText(role.toUpperCase(),147,94);
  const hp=npc.visitor.health;
  const max=npc.visitor.maxHealth;
  const ratio=typeof hp==="number"&&typeof max==="number"&&max>0
    ?Math.min(1,Math.max(0,hp/max)):1;
  ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(147,112,445,9);
  ctx.fillStyle=ratio<.3?"#e18c7e":ratio<.65?"#e4be72":"#9acba0";
  ctx.fillRect(147,112,445*ratio,9);
  npc.labelTexture.update();
  npc.root.metadata.displayName=name;
  npc.root.metadata.level=level;
  npc.root.metadata.portraitIndex=index;
  npc.root.metadata.portraitReady=atlas.complete&&atlas.naturalWidth>0;
}

export class NpcVisualSystem {
  private readonly npcs = new Map<string, NpcVisual>();
  private readonly portraits = new Image();
  private readonly doors: Record<GateSide, Mesh | null>;
  private readonly doorY: Record<GateSide, number> = { level4: DOOR_CLOSED_Y, level6: DOOR_CLOSED_Y };
  private layout:ShopLayout|null=null;
  private room:Level5Room|undefined;
  private shop:Shop|null=null;
  private onPickUp:((heroId:string,slotId:string)=>boolean)|null=null;
  private onWalkout:((heroId:string,reason:ShoppingIntent["reason"])=>void)|null=null;
  private readonly shelfOwners=new Map<string,string>();
  private carts:readonly ShopCart[]=[];
  private wishBubblesVisible=true;

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
    paidHeroIds:ReadonlySet<string>=new Set(),
    onWalkout?:((heroId:string,reason:ShoppingIntent["reason"])=>void),
    room?:Level5Room,
  ):void {
    const furnitureMoved=this.layout!==null&&(
      JSON.stringify(this.room)!==JSON.stringify(room)||
      JSON.stringify(this.layout.counter)!==JSON.stringify(layout.counter)||
      JSON.stringify(this.layout.shelves)!==JSON.stringify(layout.shelves));
    this.layout=layout;
    this.room=room;
    this.shop=shop;
    this.onPickUp=onPickUp;
    this.onWalkout=onWalkout??null;
    this.carts=carts;
    const roomSignature=JSON.stringify(room??null);
    const cartByHero=new Map(carts.map(cart=>[cart.heroId,cart]));
    const queueIds=carts.filter(cart=>cart.lines.length>0).map(cart=>cart.heroId);
    const queuePoints=checkoutQueuePoints(layout,{x:0,z:-1},queueIds.length,room);
    for(const npc of this.npcs.values()){
      // Manual payment is committed before the Day Tick, so status stays
      // at-shop for simulation but the customer must physically exit NOW.
      const manuallyPaid=paidHeroIds.has(npc.visitor.id);
      const isShopping=!shouldLeaveShopVisual(npc.visitor.status)&&!manuallyPaid;
      const held=isShopping?(cartByHero.get(npc.visitor.id)?.lines??[]):[];
      const changed=this.syncCarriedProducts(npc,held);
      npc.root.metadata.cartPaid=manuallyPaid;
      // A departing visitor has just paid by the confirmed Day Tick. Clear
      // the unpaid basket immediately, and show their updated true inventory.
      if(!isShopping){
        if(npc.phase!=="leaving"){
          this.clearWish(npc);
          this.beginLeaving(npc);
        }
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
      const key=JSON.stringify([plan?.items,plan?.reason,plan?.wantedItemId,layout.shelves,layout.counter,held,queueIndex,queuePoints[queueIndex],roomSignature]);
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

  /** The 3D shop is paused during boss/dungeon observation. Hide DOM-based
   * request bubbles while another Babylon scene occupies the viewport. */
  setWishBubblesVisible(visible:boolean):void {
    this.wishBubblesVisible=visible;
    if(!visible)for(const npc of this.npcs.values())
      if(npc.wishBubble)npc.wishBubble.root.hidden=true;
  }

  /** Read-only traffic snapshot for the opt-in F9 diagnostic panel.
   * This never changes shopping state or game saves. */
  inspectTraffic():readonly {
    id:string;phase:string;status:string;reason:string;goal:string;
    target:string;blockedSeconds:number;waypoint:string;cartUnits:number;
    motion:string;
    wish:string;restockSeconds:number|null;
    x:number;z:number;
  }[] {
    return [...this.npcs.values()].map(npc=>({
      id:npc.visitor.displayName??npc.visitor.name,
      phase:npc.phase,
      status:String(npc.root.metadata.shoppingPhase??""),
      reason:String(npc.root.metadata.shoppingReason??""),
      goal:String(npc.root.metadata.shoppingTargets?.join(",")??""),
      target:String(npc.root.metadata.shoppingTargetSlot??""),
      blockedSeconds:Math.round(npc.blockedSeconds*10)/10,
      motion:String(npc.root.metadata.movementMode??"idle"),
      waypoint:`${npc.waypoint}/${npc.route.length}`,
      cartUnits:Number(npc.root.metadata.cartUnits??0),
      wish:npc.wishItem??"",
      restockSeconds:npc.restockSeconds===null?null:
        Math.ceil(npc.restockSeconds),
      x:Math.round(npc.root.position.x*10)/10,
      z:Math.round(npc.root.position.z*10)/10,
    }));
  }

  /** E2E-only time compression for the browser expiry regression.
   * Production play always counts down the full 60 seconds. */
  setRestockTimeForE2E(heroId:string,seconds:number):void {
    if(import.meta.env.VITE_E2E!=="1"||!Number.isFinite(seconds)||
      seconds<0)throw new Error("Restock test hook disabled.");
    const npc=this.npcs.get(heroId);
    if(!npc||npc.root.metadata.shoppingPhase!=="waiting-for-restock")
      throw new Error("Customer is not waiting for a restock.");
    npc.restockSeconds=seconds;
  }

  /** Interact only with a physically present, facing, stationary petitioner. */
  nearbyBeggarId(position:Vector3,direction:Vector3,maxDistance=3.1):string|null {
    const facing=Math.hypot(direction.x,direction.z);
    if(facing<0.01)return null;
    const candidates=[...this.npcs.values()].filter(npc=>
      npc.visitor.status==="at-shop"&&
      npc.root.metadata.shoppingPhase==="waiting-for-credit");
    let nearest:{id:string;distance:number}|null=null;
    for(const npc of candidates){
      const dx=npc.root.position.x-position.x;
      const dz=npc.root.position.z-position.z;
      const distance=Math.hypot(dx,dz);
      if(distance>maxDistance||distance<0.01)continue;
      if((dx*direction.x+dz*direction.z)/(distance*facing)<0.20)continue;
      if(!nearest||distance<nearest.distance)
        nearest={id:npc.visitor.id,distance};
    }
    return nearest?.id??null;
  }

  /** The authoritative debt has already been written; animate the departure. */
  departWithCredit(heroId:string):void {
    const npc=this.npcs.get(heroId);
    if(!npc)return;
    this.clearWish(npc);
    this.beginLeaving(npc);
    npc.root.metadata.shoppingPhase="leaving-with-credit";
  }

  dismissBeggar(heroId:string):void {
    const npc=this.npcs.get(heroId);
    if(npc?.root.metadata.shoppingPhase==="waiting-for-credit")
      this.leaveUnserved(npc);
  }

  /** Physical register admission, checked immediately before the transaction. */
  readyCheckoutHeroId():string|null {
    const head=this.carts.find(cart=>cart.lines.length>0);
    if(!head||!this.layout)return null;
    const npc=this.npcs.get(head.heroId);
    if(!npc||npc.visitor.status!=="at-shop"||npc.phase!=="queueing"||
       npc.root.metadata.shoppingPhase!=="awaiting-checkout")return null;
    const point=checkoutQueuePoints(this.layout,{x:0,z:-1},1,this.room)[0];
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
    // Compute from the same snapshot for every visitor this frame. Otherwise
    // the first actor moved would change right-of-way for subsequent actors.
    const gateActors:GateTrafficActor[]=[...this.npcs.values()]
      .filter(npc=>npc.phase==="entering"||npc.phase==="leaving")
      .map(npc=>({gate:npc.gateSide,phase:npc.phase as "entering"|"leaving",
        x:npc.root.position.x,z:npc.root.position.z}));
    // An idle visitor is allowed to give way when a real incoming route
    // passes through their spot. Service queues never yield here.
    // Try at most once per cooldown to avoid oscillating idlers.
    for(const npc of this.npcs.values()){
      npc.idleYieldCooldown=Math.max(0,npc.idleYieldCooldown-delta);
      if(npc.idleYieldCooldown>0||npc.phase!=="queueing"||
         npc.root.metadata.shoppingPhase!=="waiting-for-next-day")continue;
      const idle={x:npc.root.position.x,z:npc.root.position.z};
      const blocking=[...this.npcs.values()].some(other=>{
        if(other===npc||!["entering","browsing","leaving"].includes(other.phase))
          return false;
        const next=other.route[other.waypoint];
        return !!next&&idleShopperBlocksRoute(idle,
          {x:other.root.position.x,z:other.root.position.z},
          {x:next.x,z:next.z});
      });
      if(!blocking)continue;
      const destination=this.queuePosition(npc.slot,npc,idle);
      const route=destination&&this.layout?pathToShopGoal(idle,
        {x:destination.x,z:destination.z},this.layout,this.room):null;
      npc.idleYieldCooldown=8;
      if(!route||!route.waypoints.length)continue;
      npc.phase="browsing";npc.toQueue=true;
      npc.route=route.waypoints.map(p=>new Vector3(p.x,0,p.z));
      npc.waypoint=0; npc.blockedSeconds=0;
      npc.root.metadata.phase=npc.phase;
      npc.root.metadata.shoppingPhase="clearing-aisle";
    }
    const gateFlow:Record<GateSide,"entering"|"leaving">={
      level4:gateFlowDirection("level4",gateActors),
      level6:gateFlowDirection("level6",gateActors),
    };
    for (const npc of this.npcs.values()) {
      const beforeMove={x:npc.root.position.x,z:npc.root.position.z};
      if(npc.phase==="queueing")npc.root.metadata.movementMode="waiting";
      if(npc.phase==="considering")npc.root.metadata.movementMode="inspecting";
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
      if(npc.wishBubble&&this.wishBubblesVisible){
        updateNpcWishBubble(npc.wishBubble,this.scene,npc.root.position,
          npc.restockSeconds??0,npc.root.metadata.shoppingPhase==="leaving-upset");
      }
      if(npc.phase==="queueing"&&(
        npc.root.metadata.shoppingPhase==="restock-spot-full"||
        npc.root.metadata.shoppingPhase==="credit-spot-full"||
        npc.root.metadata.shoppingPhase==="shelf-waiting-spot-full")){
        // All safe pockets are reserved. Reattempt allocation, never start
        // waiting beside a shelf merely because route creation returned null.
        npc.wait-=delta;
        if(npc.wait<=0)this.beginBrowsing(npc);
      }
      if((npc.phase==="queueing"||npc.phase==="browsing")&&(
         npc.root.metadata.shoppingPhase==="checkout-capacity-full"||
         npc.root.metadata.shoppingPhase==="idle-capacity-full"||
         npc.root.metadata.shoppingPhase==="checkout-route-blocked"||
         npc.root.metadata.shoppingPhase==="idle-route-blocked")){
        // A missing destination is temporary: stock and furniture stay
        // authoritative while visual capacity is re-evaluated periodically.
        npc.wait-=delta;
        if(npc.wait<=0)this.beginBrowsing(npc);
      }
      if(npc.phase==="leaving"&&npc.root.metadata.shoppingPhase==="blocked-exit"){
        npc.wait-=delta;
        if(npc.wait<=0)this.beginLeaving(npc);
      }
      if(npc.phase==="queueing"&&
        (npc.root.metadata.shoppingPhase==="waiting-for-restock"||
         npc.root.metadata.shoppingPhase==="waiting-for-credit"||
          npc.root.metadata.shoppingPhase==="restock-spot-full"||
          npc.root.metadata.shoppingPhase==="credit-spot-full")){
        npc.restockSeconds=restockWaitRemaining(npc.restockSeconds??RESTOCK_WAIT_SECONDS,delta);
        npc.root.metadata.restockRemaining=Math.ceil(npc.restockSeconds);
        if(npc.restockSeconds<=0)this.leaveUnserved(npc);
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
          if(!item&&checkoutQueueIndex(this.carts,npc.visitor.id)<0){
            this.leaveUnserved(npc);
          }else if(item&&this.onPickUp?.(npc.visitor.id,item.slotId)){
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
        const transit = (npc.phase==="entering"||npc.phase==="leaving")?
          {gate:npc.gateSide,phase:npc.phase,
            x:npc.root.position.x,z:npc.root.position.z}:null;
        // Outgoing shoppers wait inside; incoming shoppers wait outside.
        // Neither waits halfway through the physical gate.
        const yielding=!!transit&&mustYieldAtGate(transit,gateFlow[transit.gate]);
        npc.root.metadata.gateYield=yielding;
        if(yielding)npc.root.metadata.movementMode="gate-yield";
        if(!yielding){
          const isMovingThroughGate = !!transit && npc.root.position.z > 11.3;
          const physicalSide: GateSide = npc.root.position.x < 0 ? "level4" : "level6";
          if(!isMovingThroughGate || this.doorY[physicalSide]>=DOOR_PASSAGE_CLEAR_Y){
            this.move(npc,delta);
          }else npc.root.metadata.movementMode="door-opening";
        }
      }
      // A departing actor can dispose itself during move(). The iteration
      // snapshot still contains its old object, whose root metadata is gone.
      if(this.npcs.get(npc.visitor.id)===npc)
        this.animate(npc,delta,beforeMove);
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
    this.clearWish(npc);
    npc.slot = slot;
    npc.phase = "entering";
    npc.gateSide = npc.visitor.entranceGate ?? "level4";
    // Do not send an already-inside shopper back to the entrance just because
    // the authoritative day tick reversed its earlier departure.
    const points=entranceApproachRoute(npc.gateSide,{
      x:npc.root.position.x,z:npc.root.position.z,
    },fromOutside,CORRIDOR_INNER_Z,CORRIDOR_OUTER_Z);
    npc.route=points.map(point=>new Vector3(point.x,0,point.z));
    npc.root.metadata.shoppingPhase=points.length
      ?"walking-in":"resuming-in-shop";
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
      },this.layout,this.room):null,
    })).find(entry=>entry.route!==null);
    if(this.layout&&!chosen){
      // Never fall back to a straight wall-crossing route.
      npc.route=[];
      npc.waypoint=0;
      npc.root.metadata.shoppingPhase="blocked-exit";
      npc.wait=1.5+(npc.slot%3)*.3;
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

  /** Each unsatisfied customer owns a single, world-anchored request bubble.
   * Its SVG symbol matches the stocking hotbar and wholesale UI. */
  private showWish(npc:NpcVisual,itemId:ItemId,begging=false):void {
    if(!npc.wishBubble)npc.wishBubble=createNpcWishBubble(itemId);
    setNpcWishItem(npc.wishBubble,itemId,begging);
    npc.wishItem=itemId;
    npc.root.metadata.wantedItemId=itemId;
  }

  private clearWish(npc:NpcVisual):void {
    npc.wishBubble?.root.remove();
    npc.wishBubble=null;
    npc.wishItem=null;
    npc.restockSeconds=null;
    npc.root.metadata.wantedItemId=null;
    npc.root.metadata.restockRemaining=null;
  }

  private leaveUnserved(npc:NpcVisual):void {
    const reason=npc.intent?.reason??"no-need";
    const upset=reason==="unavailable";
    // Preserve an angry visual bubble during the walk out. Only a real,
    // guarded GameStore transition makes the visitor ineligible for future
    // same-day / next-day automatic sales.
    if(upset&&npc.wishItem&&npc.wishBubble){
      npc.restockSeconds=0;
    }else this.clearWish(npc);
    this.beginLeaving(npc);
    npc.root.metadata.shoppingPhase=upset?"leaving-upset":"leaving-unserved";
    npc.root.metadata.checkoutQueueIndex=-1;
    this.onWalkout?.(npc.visitor.id,reason);
  }

  private beginBrowsing(npc:NpcVisual):void {
    this.releaseShelf(npc);
    const item=npc.intent?.items[npc.targetIndex];
    const slot=item&&this.shop?[...this.shop.slotMeshes.values()]
      .find(s=>s.id===item.slotId):undefined;
    const origin={x:npc.root.position.x,z:npc.root.position.z};
    const checkoutIndex=checkoutQueueIndex(this.carts,npc.visitor.id);
    const action=shopperVisualAction(npc.intent,checkoutIndex>=0);
    if(!item&&(action==="wait-restock"||action==="beg")&&npc.intent?.wantedItemId){
      const begging=action==="beg";
      // The generic idle-grid starts beside the actual shelves. Restock
      // customers require reserved rear-wall pockets away from both shopping
      // aisles and the entrance. Never treat an unreachable empty route as
      // successful arrival and start the 60-second countdown in the doorway.
      const waitRoute=this.offAisleWaitingRoute(npc);
      if(npc.restockSeconds===null)npc.restockSeconds=RESTOCK_WAIT_SECONDS;
      this.showWish(npc,npc.intent.wantedItemId,begging);
      npc.root.metadata.restockRemaining=Math.ceil(npc.restockSeconds);
      npc.root.metadata.shoppingTargetSlot=null;
      npc.root.metadata.checkoutQueueIndex=-1;
      npc.toQueue=true;
      npc.route=(waitRoute?.waypoints??[]).map(p=>new Vector3(p.x,0,p.z));
      npc.waypoint=0;
      npc.phase=waitRoute?"browsing":"queueing";
      npc.wait=0.5;
      npc.root.metadata.shoppingPhase=waitRoute
        ?(begging?"walking-to-credit-wait":"walking-to-restock-wait")
        :(begging?"credit-spot-full":"restock-spot-full");
      npc.root.metadata.phase=npc.phase;
      return;
    }
    if(npc.restockSeconds!==null||npc.wishBubble)this.clearWish(npc);
    if(!item&&action==="leave-unserved"){
      npc.phase="considering";
      npc.route=[];
      npc.waypoint=0;
      npc.toQueue=false;
      npc.wait=1.35+(npc.slot%3)*0.22;
      npc.root.metadata.shoppingPhase="checking-availability";
      npc.root.metadata.shoppingTargetSlot=null;
      npc.root.metadata.checkoutQueueIndex=-1;
      npc.root.metadata.phase=npc.phase;
      return;
    }
    if(item&&slot&&this.layout&&this.shop){
      const pointForShelf=this.shop.shelfAccessPoint(slot);
      // Reserve the entire physical shelf, not individual stock slots.
      // Adjacent access points overlap once shoulder/arm meshes are included;
      // only one browser may reach a shelf at a time. Others wait off-aisle.
      const shelfAccessBusy=[...this.shelfOwners].some(([reservedId,reservedBy])=>{
        if(reservedBy===npc.visitor.id)return false;
        const reserved=[...this.shop!.slotMeshes.values()].find(s=>s.id===reservedId);
        return reserved?.shelfId===slot.shelfId;
      });
      if(shelfAccessBusy){
        // A shopper briefly queued for a busy shelf stays near that shelf.
        // Rear-wall waiting pockets are exclusively for sold-out stock and
        // begging, never for an ordinary purchase in progress.
        const waitingRoute=this.nearShelfWaitingRoute(npc,{
          x:pointForShelf.x,z:pointForShelf.z,
        });
        npc.phase="queueing";
        npc.route=waitingRoute?.waypoints.map(p=>new Vector3(p.x,0,p.z))??[];
        npc.waypoint=0;
        npc.wait=0.6+(npc.slot%4)*0.12;
        npc.root.metadata.shoppingPhase=waitingRoute
          ?"waiting-for-shelf":"shelf-waiting-spot-full";
        npc.root.metadata.shoppingTargetSlot=item.slotId;
        npc.root.metadata.phase=npc.phase;
        return;
      }
      const path=pathToShopGoal(origin,{x:pointForShelf.x,z:pointForShelf.z},this.layout,this.room);
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
    const queuePoints=this.layout?checkoutQueuePoints(this.layout,{x:0,z:-1},this.carts.length,this.room):[];
    const target=checkoutIndex>=0?queuePoints[checkoutIndex]:this.queuePosition(npc.slot,npc);
    if(!target){
      npc.phase="queueing";npc.route=[];npc.waypoint=0;
      npc.root.metadata.shoppingPhase=checkoutIndex>=0
        ?"checkout-capacity-full":"idle-capacity-full";
      npc.root.metadata.checkoutQueueIndex=checkoutIndex;
      npc.wait=1.2+(npc.slot%4)*.25;
      npc.root.metadata.phase=npc.phase;
      return;
    }
    const route=this.layout?pathToShopGoal(origin,
      {x:target.x,z:target.z},this.layout,this.room):null;
    npc.phase=route?"browsing":"queueing";npc.toQueue=true;
    npc.wait=route?0:1.2+(npc.slot%4)*.25;
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

  private nearShelfWaitingRoute(npc:NpcVisual,target:{x:number;z:number}):
    NonNullable<ReturnType<typeof reserveShelfWaitingRoute>>["route"]|null {
    if(!this.layout)return null;
    const others=[...this.npcs.values()].filter(other=>other!==npc);
    return reserveShelfWaitingRoute(this.layout,
      {x:npc.root.position.x,z:npc.root.position.z},target,
      others.map(other=>({x:other.root.position.x,z:other.root.position.z})),
      others.map(other=>other.route.at(-1))
        .filter((point):point is Vector3=>point!==undefined)
        .map(point=>({x:point.x,z:point.z})),this.room)?.route??null;
  }

  private offAisleWaitingRoute(npc:NpcVisual):
    NonNullable<ReturnType<typeof reserveRestockWaitingRoute>>["route"]|null {
    if(!this.layout)return null;
    const others=[...this.npcs.values()].filter(other=>other!==npc);
    const occupied=others.map(other=>({
      x:other.root.position.x,z:other.root.position.z,
    }));
    const destinations=others.map(other=>other.route.at(-1))
      .filter((point):point is Vector3=>point!==undefined)
      .map(point=>({x:point.x,z:point.z}));
    return reserveRestockWaitingRoute(this.layout,
      {x:npc.root.position.x,z:npc.root.position.z},
      occupied,destinations,npc.slot,this.room)?.route??null;
  }

  private queuePosition(slot:number,npc:NpcVisual,avoid?:{x:number;z:number}):Vector3|null {
    if(!this.layout)return null;
    const points=idleShopPositions(this.layout,100,this.room);
    const preferred=points[slot];
    // Assign a distinct *future* standing spot, not merely a position that
    // happens to be free this frame. Otherwise multiple shoppers all route
    // to the same empty place and jam when they arrive there together.
    const reservedByAnother=(point:{x:number;z:number})=>
      [...this.npcs.values()].some(other=>{
        if(other===npc)return false;
        const current=other.root.position;
        if(Math.hypot(point.x-current.x,point.z-current.z)<PERSONAL_SPACE)return true;
        const destination=other.route.at(-1);
        return !!destination&&Math.hypot(point.x-destination.x,
          point.z-destination.z)<PERSONAL_SPACE;
      });
    const candidates=preferred?[preferred,...points.filter(p=>p!==preferred)]:points;
    const point=candidates.find(p=>!reservedByAnother(p)&&
      (!avoid||Math.hypot(p.x-avoid.x,p.z-avoid.z)>=1.85));
    return point?new Vector3(point.x,0,point.z):null;
  }

  /** React to actual lack of progress, including a contested final waypoint.
   * A stuck visitor *inside* the entrance may immediately start navigating
   * toward its own needs instead of holding a staging spot indefinitely.
   * Outside the gate we continue to yield rather than cross corridor walls.
   */
  private recoverTraffic(npc:NpcVisual):boolean{
    const phase=npc.root.metadata.shoppingPhase;
    if(npc.phase==="entering" &&
      npc.root.position.z<=CORRIDOR_INNER_Z+0.15 &&
      npc.blockedSeconds>2){
      npc.blockedSeconds=0;
      this.beginBrowsing(npc);
      return true;
    }
    if(npc.phase==="browsing"&&npc.blockedSeconds>3 ||
       npc.phase==="queueing"&&phase==="waiting-for-shelf"&&npc.blockedSeconds>3){
      npc.blockedSeconds=0;
      this.beginBrowsing(npc);
      return true;
    }
    if(npc.phase==="leaving"&&npc.blockedSeconds>5){
      npc.blockedSeconds=0;
      this.beginLeaving(npc);
      return true;
    }
    return false;
  }

  private move(npc: NpcVisual, delta: number): void {
    const target=npc.route[npc.waypoint];
    if(!target){
      if(npc.phase==="entering"){
        this.beginBrowsing(npc);
      }else if(npc.phase==="browsing"){
        if(npc.toQueue){
          if(npc.root.metadata.shoppingPhase==="checkout-route-blocked"||
            npc.root.metadata.shoppingPhase==="idle-route-blocked")return;
          npc.phase="queueing";
          npc.root.metadata.shoppingPhase=npc.root.metadata.shoppingPhase==="walking-to-restock-wait"
            ?"waiting-for-restock"
            :npc.root.metadata.shoppingPhase==="walking-to-credit-wait"
              ?"waiting-for-credit"
            :checkoutQueueIndex(this.carts,npc.visitor.id)>=0
              ?"awaiting-checkout":"waiting-for-next-day";
        }else{
          npc.phase="considering";
          npc.wait=1.1+(npc.slot%3)*0.35;
          npc.root.metadata.shoppingPhase="considering-item";
        }
        npc.root.metadata.phase=npc.phase;
      }else if(npc.phase==="leaving"){
        if(npc.root.position.z>=CORRIDOR_OUTER_Z-0.12)this.dispose(npc);
        else npc.root.metadata.shoppingPhase="blocked-exit";
      }
      return;
    }
    const from={x:npc.root.position.x,z:npc.root.position.z};
    const dx=target.x-from.x,dz=target.z-from.z,distance=Math.hypot(dx,dz);
    const occupied=[...this.npcs.values()].filter(other=>other!==npc)
      .map(other=>({x:other.root.position.x,z:other.root.position.z}));
    if(distance<=NPC_FINAL_WAYPOINT_RADIUS){
      const heldByNeighbor=occupied.some(other=>
        Math.hypot(other.x-target.x,other.z-target.z)<PERSONAL_SPACE);
      if(!canFinishShopWaypoint(distance,heldByNeighbor,npc.blockedSeconds)){
        // Keep waiting for an occupied *visual* waypoint, but never forever.
        // Shelf and checkout admission have their own exclusive reservations.
        npc.blockedSeconds+=delta;
        npc.root.metadata.blockedSeconds=npc.blockedSeconds;
        npc.root.metadata.softPassing=false;
        npc.root.metadata.movementMode="waypoint-yield";
        return;
      }
      npc.root.position.x=target.x;
      npc.root.position.z=target.z;
      npc.waypoint+=1;
      npc.blockedSeconds=0;
      npc.root.metadata.blockedSeconds=0;
      npc.root.metadata.softPassing=heldByNeighbor;
      npc.root.metadata.movementMode=heldByNeighbor?"soft-pass":"waypoint";
      return;
    }
    const walkable=(next:{x:number;z:number}):boolean=>{
      // Inside the gates, entrance and exit flow each has its own corridor lane.
      if(next.z>6.6){
        const center=next.x<0?CORRIDOR_X.level4:CORRIDOR_X.level6;
        if(Math.abs(next.x-center)>0.68)return false;
      }
      if(!this.layout||(from.z>6.6&&next.z>6.6))return true;
      // Only the portion within the indoor nav grid can be sampled.
      // Clip either crossing direction at z=6.6, avoiding false wall collisions.
      let a={...from},b={...next};
      if(a.z>6.6){
        const fraction=(a.z-6.6)/(a.z-b.z);
        a={x:a.x+(b.x-a.x)*fraction,z:6.6};
      }else if(b.z>6.6){
        const fraction=(6.6-a.z)/(b.z-a.z);
        b={x:a.x+(b.x-a.x)*fraction,z:6.6};
      }
      return shopSegmentClear(a,b,this.layout,this.room);
    };
    // Once a hero approaches the narrow gate, remain in its reserved lane.
    // NPC bodies yield to each other only briefly here; crossing opposite
    // directions still obeys gateFlowDirection / mustYieldAtGate.
    // Side-stepping at z≈6 used to push entering and leaving actors back
    // toward one another even though their long-distance lanes were distinct.
    // Restrict only the *physical throat*, not an entire long route whose
    // far-away destination happens to be the gate; indoor shoppers still
    // need to steer around shelves and other visitors en route.
    const inGateApproach=(npc.phase==="entering"||npc.phase==="leaving")&&
      from.z>=5.1;
    const move=shopCrowdStep(from,{x:target.x,z:target.z},occupied,
      WALK_SPEED*delta,walkable,npc.blockedSeconds,!inGateApproach&&from.z<=6.5,
      inGateTrafficThroat(from)?NPC_GATE_SOFT_PASS_AFTER_SECONDS:NPC_SOFT_PASS_AFTER_SECONDS);
    const proposed=move.point;
    if(!proposed){
      npc.blockedSeconds+=delta;
      npc.root.metadata.blockedSeconds=npc.blockedSeconds;
      npc.root.metadata.softPassing=false;
      const nearest={x:from.x+(dx/distance)*Math.min(distance,WALK_SPEED*delta),
        z:from.z+(dz/distance)*Math.min(distance,WALK_SPEED*delta)};
      npc.root.metadata.movementMode=walkable(nearest)?"crowd-block":"static-block";
      // A *static* obstruction still requires a new path. NPC traffic alone
      // becomes nonblocking after a short wait via shopCrowdStep above.
      this.recoverTraffic(npc);
      return;
    }
    const step=Math.min(distance,WALK_SPEED*delta);
    const direct={x:from.x+dx/distance*step,z:from.z+dz/distance*step};
    const steering=Math.hypot(proposed.x-direct.x,proposed.z-direct.z);
    // Keep soft-passing through this waypoint after its first release rather
    // than flickering between stepping and freezing every other frame.
    npc.blockedSeconds=move.softPass?NPC_SOFT_PASS_AFTER_SECONDS:
      steering>0.015?npc.blockedSeconds+delta:0;
    npc.root.metadata.blockedSeconds=npc.blockedSeconds;
    npc.root.metadata.softPassing=move.softPass;
    npc.root.metadata.movementMode=move.softPass?"soft-pass":steering>0.015?"sidestep":"moving";
    if(!move.softPass&&this.recoverTraffic(npc))return;
    npc.root.rotation.y=Math.atan2(proposed.x-from.x,proposed.z-from.z);
    npc.root.position.x=proposed.x;
    npc.root.position.z=proposed.z;
  }

  private animate(npc: NpcVisual,delta:number,beforeMove:{x:number;z:number}): void {
    const motion=npcLocomotion(beforeMove,{
      x:npc.root.position.x,z:npc.root.position.z,
    },delta,WALK_SPEED);
    // Animation follows actual displacement, even while queueing, seeking
    // a safe stand, or sidestepping. A blocked character no longer moonwalks.
    npc.animationTime+=delta*(motion.moving?motion.strideScale:0.3);
    const swing=motion.moving
      ?Math.sin(npc.animationTime*8)*0.65
      :Math.sin(npc.animationTime*2)*0.035;
    npc.legs[0].rotation.x=swing;
    npc.legs[1].rotation.x=-swing;
    npc.arms[0].rotation.x=-swing*0.7;
    npc.arms[1].rotation.x=swing*0.7;
    npc.torso.position.y=1.14+Math.sin(npc.animationTime*2)*
      (motion.moving?0.025:0.01);
    npc.root.position.y=0.6*Math.cos(swing)-0.6;
    npc.root.metadata.animatingWalk=motion.moving;
    npc.root.metadata.actualSpeed=Math.round(motion.speed*100)/100;
  }

  private dispose(npc: NpcVisual): void {
    this.releaseShelf(npc);
    this.clearWish(npc);
    this.clearSaleTag(npc);
    this.syncCarriedProducts(npc, []);
    npc.root.dispose(false, true);
    this.npcs.delete(npc.visitor.id);
  }
}
