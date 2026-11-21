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
import {portraitSourceRect} from "./portraitAtlas.ts";
import {goldIconUrl} from "../uiIcons.ts";
import { createHeroVisual, setHeroVisualEquipment, type HeroVisual } from "./heroVisual.ts";
import { RESTOCK_WAIT_SECONDS, shopperVisualAction, type ShoppingIntent, type ShoppingInterest } from "./shopperIntents.ts";
import {WORLD_TICK_SECONDS} from "./worldClock.ts";
import {interpolateSavedShopPose,type SavedShopPose} from "./shopVisualInterpolation.ts";
import type {ShopTrafficCheckpoint,ShopTrafficActor} from "./shopTraffic.ts";
import { createNpcWishBubble, setNpcWishItem, updateNpcWishBubble,
  createNpcCustomerBubble, positionNpcBubble,
  type NpcWishBubble, type NpcCustomerBubble } from "./npcWishBubble.ts";
import {customerBark, customerBarkPriority,
  type CustomerBarkKind} from "./npcCustomerBarks.ts";
import type { ItemId } from "./economy.ts";
import type {LiveServiceRequest} from "./shopServiceFocus.ts";
import { ITEMS } from "./economy.ts";
import type { ShopCart } from "./shopCarts.ts";
import {checkoutQueueIndex,checkoutQueuePoints,checkoutWaitAlreadyAtSlot} from "./checkoutQueue.ts";
import { NPC_CENTER_CLEARANCE, NPC_FINAL_WAYPOINT_RADIUS, NPC_SOFT_PASS_AFTER_SECONDS, NPC_GATE_SOFT_PASS_AFTER_SECONDS, inGateTrafficThroat, canFinishShopWaypoint, shopCrowdStep, entranceApproachRoute, gateFlowDirection, mustYieldAtGate, canShareGateLanes, gateTravelLane, isInExitCorridor, idleShopperBlocksRoute, nextEntranceSpawnZ, crowdStallSeconds, trackWaypointProgress, canYieldShopperSpot, type WaypointProgress, type GateTrafficActor } from "./npcTraffic.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear, type ShopperRoute, type ShopPoint } from "./shopperNavigation.ts";
import { ShopServiceSpots } from "./shopServiceSpots.ts";

import {npcLocomotion,easedNpcWalkSpeed,turnNpcToward} from "./npcLocomotion.ts";
import {npcShopPose,type ConfirmedVisualAction} from "./npcShopGestures.ts";
import {getCounterPlacement} from "./shopLayout.ts";

import type { ShopLayout } from "./shopLayout.ts";
import type { Shop } from "./shop.ts";

/** Persisted petition deadlines are owned by GameStore, not Babylon. */
interface ShopRequestClockAccess {
  start(heroId:string,itemId:ItemId,reason:"unavailable"|"cannot-afford"):number|null;
  remaining(heroId:string):number|null;
  shortenE2E(heroId:string,seconds:number):void;
  expiredWithoutStock(heroId:string):boolean;
}
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
  /** Presentation-only current walking speed: never saved or used by sales. */
  walkSpeed:number;
  /** Ephemeral motion-only action cues. Actual pickups/payments remain in GameStore. */
  confirmedAction:ConfirmedVisualAction;
  confirmedSeconds:number;
  performanceTime:number;
  blockedSeconds:number;
  routeProgress:WaypointProgress|null;
  trafficReroutes:number;
  idleYieldCooldown:number;
  restockSeconds:number|null;
  /** After approaching a service station, roam between reachable quiet
   * destinations while the original request timer keeps running. */
  requestActive:boolean;
  roamLeg:number;
  wishItem:ItemId|null;
  wishBubble:NpcWishBubble|null;
  /** Short lines already delivered this visit. Not saved to the campaign. */
  barkedEvents:Set<string>;
  gateSide: GateSide;
  readonly labelTexture: DynamicTexture;
  readonly labelMesh: Mesh;
  saleTag: Mesh | null;
  saleSeconds: number;
}

/** One bounded on-screen customer voice, not a second shopper behavior tree. */
interface PendingCustomerBark {
  readonly heroId:string;
  readonly kind:CustomerBarkKind;
  readonly message:string;
  readonly priority:number;
  readonly expiresAt:number;
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
let nameplateGold:HTMLImageElement|null=null;
function paintIdentity(npc:NpcVisual,atlas:HTMLImageElement):void {
  if(!nameplateGold){
    nameplateGold=new Image();
    nameplateGold.src=goldIconUrl();
  }
  if(!nameplateGold.complete)
    nameplateGold.addEventListener("load",()=>paintIdentity(npc,atlas),{once:true});
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
    const rect=portraitSourceRect(atlas,index);
    ctx.drawImage(atlas,rect.sx,rect.sy,rect.sw,rect.sh,20,24,102,102);
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
  const visitorGold=Number.isFinite(npc.visitor.gold)?Math.max(0,npc.visitor.gold??0):0;
  if(nameplateGold?.complete&&nameplateGold.naturalWidth>0)
    ctx.drawImage(nameplateGold,461,74,24,24);
  ctx.fillStyle="#f3d19a";
  ctx.font="700 25px system-ui";
  ctx.fillText(visitorGold+"g",492,94,111);
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
  npc.root.metadata.gold=visitorGold;
  npc.root.metadata.portraitIndex=index;
  npc.root.metadata.portraitReady=atlas.complete&&atlas.naturalWidth>0;
}

function createHumanoid(scene: Scene, visitor: VisitorSnapshot, slot: number, position: Vector3, atlas: HTMLImageElement): NpcVisual {
  const model = createHeroVisual(scene, {
    id: visitor.id, role: visitor.role,
    equipment: visitor.equipment ?? { weapon: null, armor: null },
  }, `npc-${visitor.id}`);
  const { root, arms, legs, torso } = model;
  root.position.copyFrom(position);
  // Entrants begin facing into the shop, not walking backward while turning.
  root.rotation.y=Math.PI;

  const label = MeshBuilder.CreatePlane(`npc-${visitor.id}-label`, { width: 1.36, height: 0.34 }, scene);
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
    elapsed: 0, wait: 0, browseSide: Number(visitor.id.replace(/\D/g, "")) % 2 ? -1 : 1, animationTime: 0, walkSpeed:0, confirmedAction:null,confirmedSeconds:0,
    performanceTime:slot*.37, blockedSeconds:0, routeProgress:null, trafficReroutes:0, idleYieldCooldown:0,
    gateSide: visitor.entranceGate ?? "level4",
    restockSeconds:null,requestActive:false,roamLeg:0,
    wishItem:null,wishBubble:null,barkedEvents:new Set(),
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
  private room:Level5Room|undefined;
  private shop:Shop|null=null;
  private onPickUp:((heroId:string,slotId:string)=>boolean)|null=null;
  private onWalkout:((heroId:string,reason:ShoppingIntent["reason"])=>void)|null=null;
  private readonly completedExits:{heroId:string;outerGateZ:number}[]=[];
  // A read-only, one-tick PRESENTATION trail. Gameplay/crowd checks and
  // saved traffic always use the true npc.root transforms at tick boundaries.
  private readonly presentationTrails=
    new Map<string,{from:SavedShopPose;to:SavedShopPose}>();
  rememberCommittedMotion(before:ShopTrafficCheckpoint,after:ShopTrafficCheckpoint):void{
    this.presentationTrails.clear();
    const old=new Map(before.actors.map(a=>[a.heroId,a]));
    for(const actor of after.actors){
      const prior=old.get(actor.heroId);
      if(!prior||prior.x===actor.x&&prior.z===actor.z&&prior.yaw===actor.yaw)
        continue;
      this.presentationTrails.set(actor.heroId,{
        from:{x:prior.x,z:prior.z,yaw:prior.yaw},
        to:{x:actor.x,z:actor.z,yaw:actor.yaw},
      });
    }
  }
  clearPresentationMotion():void{this.presentationTrails.clear();}
  /** Temporarily paint the last saved 50ms step at fractional render time.
   * Restore ALL authoritative root transforms synchronously, even if Babylon
   * throws. No render write may enter GameStore or the next pathfinding tick.
   */
  renderInterpolated<T>(fraction:number,draw:()=>T):T{
    if(this.worldPaused||fraction>=1||!this.presentationTrails.size)
      return draw();
    const original:{npc:NpcVisual;x:number;z:number;yaw:number}[]=[];
    for(const [heroId,trail] of this.presentationTrails){
      const npc=this.npcs.get(heroId);
      if(!npc)continue;
      original.push({npc,x:npc.root.position.x,z:npc.root.position.z,
        yaw:npc.root.rotation.y});
      const pose=interpolateSavedShopPose(trail.from,trail.to,fraction);
      npc.root.position.x=pose.x;
      npc.root.position.z=pose.z;
      npc.root.rotation.y=pose.yaw;
    }
    try{return draw();}
    finally{
      for(const saved of original){
        saved.npc.root.position.x=saved.x;
        saved.npc.root.position.z=saved.z;
        saved.npc.root.rotation.y=saved.yaw;
      }
    }
  }
  /** Drain only after the outgoing mesh was removed AND the authoritative
   * shop traffic checkpoint was committed. Autosave must never see an
   * off-duty hero with an in-flight physical shop actor. */
  drainCompletedExits():readonly {heroId:string;outerGateZ:number}[]{
    return this.completedExits.splice(0);
  }
  private shopRequestClock:ShopRequestClockAccess|null=null;
  private worldPaused=false;
  setWorldPaused(paused:boolean):void{this.worldPaused=paused;}
  /** Physical traffic, collision arbitration, route choices and shelf pickups
   * run ONLY for committed world ticks, never according to the render FPS.
   * This still needs a persisted traffic checkpoint before reload is exact.
   */
  advanceWorldTicks(ticks:number):void{
    if(this.worldPaused||ticks===0)return;
    if(!Number.isSafeInteger(ticks)||ticks<0||ticks>8)
      throw new RangeError("Shop movement needs bounded committed world ticks.");
    for(let step=0;step<ticks;step++)this.updateStep(WORLD_TICK_SECONDS);
  }
  /** Save the actual in-flight motor, not a replay/recomputed customer plan.
   * This checkpoint is committed at the same tick as the GameStore clock.
   */
  snapshotTraffic(day:number,tick:number):ShopTrafficCheckpoint{
    const actors:ShopTrafficActor[]=[...this.npcs.values()].map(npc=>({
      heroId:npc.visitor.id,
      x:npc.root.position.x,z:npc.root.position.z,yaw:npc.root.rotation.y,
      slot:npc.slot,gateSide:npc.gateSide,phase:npc.phase,
      shoppingPhase:String(npc.root.metadata.shoppingPhase??""),
      shoppingReason:String(npc.root.metadata.shoppingReason??"no-need"),
      shoppingTargetSlot:typeof npc.root.metadata.shoppingTargetSlot==="string"
        ?npc.root.metadata.shoppingTargetSlot:null,
      checkoutQueueIndex:Number.isSafeInteger(npc.root.metadata.checkoutQueueIndex)
        ?Number(npc.root.metadata.checkoutQueueIndex):-1,
      route:npc.route.map(p=>({x:p.x,z:p.z})),waypoint:npc.waypoint,
      toQueue:npc.toQueue,intentKey:npc.intentKey,targetIndex:npc.targetIndex,
      wait:npc.wait,elapsed:npc.elapsed,blockedSeconds:npc.blockedSeconds,
      routeProgress:npc.routeProgress?{
        target:{...npc.routeProgress.target},
        closest:npc.routeProgress.closest,
        stagnantSeconds:npc.routeProgress.stagnantSeconds,
      }:null,
      trafficReroutes:npc.trafficReroutes,
      idleYieldCooldown:npc.idleYieldCooldown,
      requestActive:npc.requestActive,roamLeg:npc.roamLeg,
      restockSeconds:npc.restockSeconds,wishItem:npc.wishItem,
      walkSpeed:npc.walkSpeed,animationTime:npc.animationTime,
      performanceTime:npc.performanceTime,browseSide:npc.browseSide,
    }));
    return {day,tick,initialized:true,actors,
      claims:this.serviceSpots.snapshot().map(c=>({
        heroId:c.heroId,role:c.role,point:{...c.point}})),
      shelfOwners:this.serviceSpots.snapshotShelfOwners(),
      doorY:{...this.doorY}};
  }

  /** Called after the SAME saved GameState has rebuilt the shop layout and
   * real shopping intentions. Restore actual actors and previous reservations
   * without rerunning entrance paths, collision routing or shelf pickup.
   */
  restoreTraffic(
    checkpoint:ShopTrafficCheckpoint,
    visitors:readonly VisitorSnapshot[],
  ):void{
    this.clearPresentationMotion();
    if(!checkpoint.initialized)return;
    if(!this.layout)throw new Error("Restore shop layout before restoring physical traffic.");
    const byId=new Map(visitors.map(v=>[v.id,v]));
    const saved=new Map(checkpoint.actors.map(actor=>[actor.heroId,actor]));
    for(const npc of [...this.npcs.values()])
      if(!saved.has(npc.visitor.id))this.dispose(npc);
    for(const actor of checkpoint.actors){
      const visitor=byId.get(actor.heroId);
      if(!visitor)throw new Error("Shop checkpoint has an unknown visitor.");
      let npc=this.npcs.get(actor.heroId);
      if(!npc){
        npc=createHumanoid(this.scene,visitor,actor.slot,
          new Vector3(actor.x,0,actor.z),this.portraits);
        this.npcs.set(actor.heroId,npc);
      }
      npc.visitor=visitor;
      npc.root.position.x=actor.x;
      npc.root.position.z=actor.z;
      npc.root.rotation.y=actor.yaw;
      npc.slot=actor.slot;
      npc.gateSide=actor.gateSide;
      npc.phase=actor.phase;
      npc.route=actor.route.map(point=>new Vector3(point.x,0,point.z));
      npc.waypoint=actor.waypoint;
      npc.toQueue=actor.toQueue;
      npc.intentKey=actor.intentKey;
      npc.targetIndex=actor.targetIndex;
      npc.wait=actor.wait;
      npc.elapsed=actor.elapsed;
      npc.blockedSeconds=actor.blockedSeconds;
      npc.routeProgress=actor.routeProgress?{
        target:{...actor.routeProgress.target},
        closest:actor.routeProgress.closest,
        stagnantSeconds:actor.routeProgress.stagnantSeconds,
      }:null;
      npc.trafficReroutes=actor.trafficReroutes;
      npc.idleYieldCooldown=actor.idleYieldCooldown;
      npc.requestActive=actor.requestActive;
      npc.roamLeg=actor.roamLeg;
      npc.restockSeconds=actor.restockSeconds;
      npc.walkSpeed=actor.walkSpeed;
      npc.animationTime=actor.animationTime;
      npc.performanceTime=actor.performanceTime;
      npc.browseSide=actor.browseSide;
      npc.root.metadata.phase=actor.phase;
      npc.root.metadata.gateSide=actor.gateSide;
      npc.root.metadata.simulationStatus=visitor.status;
      npc.root.metadata.shoppingPhase=actor.shoppingPhase;
      npc.root.metadata.shoppingReason=actor.shoppingReason;
      npc.root.metadata.shoppingTargetSlot=actor.shoppingTargetSlot;
      npc.root.metadata.checkoutQueueIndex=actor.checkoutQueueIndex;
      npc.root.metadata.blockedSeconds=actor.blockedSeconds;
      npc.root.metadata.trafficReroutes=actor.trafficReroutes;
      npc.root.metadata.restockRemaining=actor.restockSeconds;
      npc.root.metadata.movementMode="restored";
      npc.wishBubble?.root.remove();
      npc.wishBubble=null;
      npc.wishItem=null;
      if(actor.wishItem){
        this.showWish(npc,actor.wishItem,actor.shoppingReason==="cannot-afford");
        npc.restockSeconds=actor.restockSeconds;
      }
      paintIdentity(npc,this.portraits);
    }
    // Map order determines deterministic right-of-way in the NEXT shop
    // step. Restoring only positions but retaining fresh-spawn insertion
    // order would reroute the crowd differently after reload.
    const ordered=new Map<string,NpcVisual>();
    for(const actor of checkpoint.actors){
      const npc=this.npcs.get(actor.heroId);
      if(!npc)throw new Error("Missing restored physical visitor");
      ordered.set(actor.heroId,npc);
    }
    this.npcs.clear();
    for(const [id,npc] of ordered)this.npcs.set(id,npc);
    this.serviceSpots.restoreClaims(checkpoint.claims,checkpoint.shelfOwners,
      this.layout,this.room);
    for(const gate of ["level4","level6"] as const){
      this.doorY[gate]=checkpoint.doorY[gate];
      if(this.doors[gate])this.doors[gate]!.position.y=this.doorY[gate];
    }
    this.customerBarkQueue.length=0;
    this.activeCustomerBark=null;
    this.customerBubble.root.hidden=true;
  }

  private readonly serviceSpots=new ShopServiceSpots();
  private carts:readonly ShopCart[]=[];
  /** Shopping-state notifications may happen without a new day. A committed
   * manual payment keeps the simulated hero at-shop until closing, but the
   * visual is already leaving and must never be regenerated or reversed. */
  private paidThisDay:ReadonlySet<string>=new Set();
  private wishBubblesVisible=true;
  private engagedBeggarId:string|null=null;
  private readonly customerBubble:NpcCustomerBubble;
  private readonly customerBarkQueue:PendingCustomerBark[]=[];
  private activeCustomerBark:{entry:PendingCustomerBark;until:number}|null=null;
  private nextCustomerBarkAt=0;

  /** An E-dialog is an actual customer conversation. Keep that customer
   * present, looking at Galvik, and do not expire their request mid-dialog. */
  holdBeggarConversation(heroId:string|null):void {
    this.engagedBeggarId=heroId;
  }

  constructor(private readonly scene: Scene) {
    this.customerBubble=createNpcCustomerBubble();
    this.portraits.addEventListener("load", () => {
      for (const npc of this.npcs.values()) paintIdentity(npc, this.portraits);
    });
    this.portraits.src = import.meta.env.BASE_URL + "assets/hero-portraits.webp";
    this.doors = {
      level4: scene.getMeshByName("level-4-barrier") as Mesh | null,
      level6: scene.getMeshByName("level-6-barrier") as Mesh | null,
    };
    // Render frames may only draw the already-committed customer scene.
    // GameStore + WorldClockPacer explicitly invoke advanceWorldTicks. No
    // second frame-clock shopper solver is installed here.
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
        // "at-shop" is deliberately retained in the economy until the day
        // closes, even after a manual checkout. A roster/permit update must
        // never revive that paid customer's already-running exit animation.
        if (visual.phase === "leaving" && visitor.status==="at-shop" &&
            !this.paidThisDay.has(visitor.id))
          this.beginEntering(visual, visual.slot, false);
      } else {
        // This hero may have walked completely offscreen after payment.
        // A later unrelated GameStore update must not spawn them again.
        if(this.paidThisDay.has(visitor.id)||visitor.status==="departing")continue;
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        usedSlots.add(slot);
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
    clock?:ShopRequestClockAccess,
  ):void {
    this.shopRequestClock=clock??null;
    const hadProjection=this.layout!==null;
    const furnitureMoved=this.layout!==null&&(
      JSON.stringify(this.room)!==JSON.stringify(room)||
      JSON.stringify(this.layout.counter)!==JSON.stringify(layout.counter)||
      JSON.stringify(this.layout.shelves)!==JSON.stringify(layout.shelves));
    this.layout=layout;
    this.room=room;
    this.serviceSpots.configure(layout,room);
    this.shop=shop;
    this.onPickUp=onPickUp;
    this.onWalkout=onWalkout??null;
    this.carts=carts;
    const priorPaid=this.paidThisDay;
    const wasInitialized=hadProjection;
    this.paidThisDay=paidHeroIds;
    const roomSignature=JSON.stringify(room??null);
    const cartByHero=new Map(carts.map(cart=>[cart.heroId,cart]));
    const queueIds=carts.filter(cart=>cart.lines.length>0).map(cart=>cart.heroId);
    const queuePoints=checkoutQueuePoints(layout,{x:0,z:-1},queueIds.length,room);
    for(const npc of this.npcs.values()){
      // Manual payment is committed before the Day Tick, so status stays
      // at-shop for simulation but the customer must physically exit NOW.
      const manuallyPaid=paidHeroIds.has(npc.visitor.id);
      if(wasInitialized&&manuallyPaid&&!priorPaid.has(npc.visitor.id))
        this.queueCustomerBark(npc,"paid");
      const isShopping=!shouldLeaveShopVisual(npc.visitor.status)&&!manuallyPaid;
      const held=isShopping?(cartByHero.get(npc.visitor.id)?.lines??[]):[];
      const changed=this.syncCarriedProducts(npc,held);
      npc.root.metadata.cartPaid=manuallyPaid;
      // A departing visitor has just paid by the confirmed Day Tick. Clear
      // the unpaid basket immediately, and show their updated true inventory.
      if(!isShopping){
        const expired=!!this.shopRequestClock?.expiredWithoutStock(npc.visitor.id);
        if(expired){
          // The saved visitor event already committed the actual departure.
          // Preserve the angry wish bubble without firing a second walkout.
          npc.restockSeconds=0;
          this.queueCustomerBark(npc,"unserved",npc.wishItem);
        }else if(npc.phase!=="leaving")this.clearWish(npc);
        if(npc.phase!=="leaving")this.beginLeaving(npc);
        if(expired)npc.root.metadata.shoppingPhase="leaving-upset";
        if(changed)paintIdentity(npc,this.portraits);
        // Leaving visitors keep their route across regular economy refreshes,
        // but must replan when moved furniture would intersect a cached path.
        // Past the inner gate they are already beyond any movable furniture.
        if(npc.phase==="leaving"&&(
          npc.root.metadata.shoppingPhase==="blocked-exit"||
          (furnitureMoved&&npc.root.position.z<=CORRIDOR_INNER_Z)))
          this.beginLeaving(npc,true);
        continue;
      }
      const plan=plans.get(npc.visitor.id)??null;
      const queueIndex=checkoutQueueIndex(carts,npc.visitor.id);
      const key=JSON.stringify([plan?.items,plan?.reason,plan?.wantedItemId,layout.shelves,layout.counter,held,queueIndex,queuePoints[queueIndex],roomSignature]);
      if(key===npc.intentKey)continue;
      const alreadyWaiting=checkoutWaitAlreadyAtSlot(
        npc.phase,String(npc.root.metadata.shoppingPhase??""),
        queueIndex,{x:npc.root.position.x,z:npc.root.position.z},
        queuePoints[queueIndex],furnitureMoved);
      npc.intent=plan;
      npc.intentKey=key;
      if(alreadyWaiting){
        npc.root.metadata.checkoutQueueIndex=queueIndex;
        continue;
      }
      npc.targetIndex=0;
      npc.trafficReroutes=0;
      npc.routeProgress=null;
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
    if(this.wishBubblesVisible===visible)return;
    this.wishBubblesVisible=visible;
    if(!visible){
      for(const npc of this.npcs.values())
        if(npc.wishBubble)npc.wishBubble.root.hidden=true;
      this.customerBubble.root.hidden=true;
      this.customerBarkQueue.length=0;
      this.activeCustomerBark=null;
    }
  }

  /** Event-driven and cosmetic only. Bound per hero/visit, with no RNG, save
   * writes, route changes or automatic shop actions. */
  private queueCustomerBark(
    npc:NpcVisual,kind:CustomerBarkKind,itemId:ItemId|null=null,
  ):void {
    const key=kind+":"+(itemId??"");
    if(npc.barkedEvents.has(key))return;
    npc.barkedEvents.add(key);
    const entry:PendingCustomerBark={
      heroId:npc.visitor.id,kind,
      message:customerBark({heroId:npc.visitor.id,role:npc.visitor.role,
        gold:npc.visitor.gold,itemId,kind}),
      priority:customerBarkPriority(kind),
      expiresAt:performance.now()+14000,
    };
    this.customerBarkQueue.push(entry);
    this.customerBarkQueue.sort((a,b)=>b.priority-a.priority);
    // A crowded shop must not queue a wall of stale dialogue.
    if(this.customerBarkQueue.length>12)this.customerBarkQueue.length=12;
  }

  private showNextCustomerBark():void {
    const bubble=this.customerBubble;
    if(!this.wishBubblesVisible||document.querySelector("dialog[open]")){
      bubble.root.hidden=true;return;
    }
    const now=performance.now();
    if(this.activeCustomerBark){
      const {entry,until}=this.activeCustomerBark;
      const npc=this.npcs.get(entry.heroId);
      if(npc&&now<until){
        positionNpcBubble(bubble.root,this.scene,npc.root.position,3.65);
        return;
      }
      this.activeCustomerBark=null;
      this.nextCustomerBarkAt=now+1600;
    }
    bubble.root.hidden=true;
    if(now<this.nextCustomerBarkAt)return;
    const camera=this.scene.activeCamera?.globalPosition;
    if(!camera)return;
    for(let index=0;index<this.customerBarkQueue.length;index++){
      const entry=this.customerBarkQueue[index]!;
      const npc=this.npcs.get(entry.heroId);
      if(!npc||entry.expiresAt<now){
        this.customerBarkQueue.splice(index--,1);continue;
      }
      if(Vector3.Distance(camera,npc.root.getAbsolutePosition())>9)continue;
      bubble.speaker.textContent=npc.visitor.displayName??npc.visitor.name;
      bubble.line.textContent=entry.message;
      bubble.root.dataset.kind=entry.kind;
      if(!positionNpcBubble(bubble.root,this.scene,npc.root.position,3.65))
        continue;
      this.customerBarkQueue.splice(index,1);
      this.activeCustomerBark={entry,until:now+2600};
      return;
    }
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
    if(!npc||npc.intent?.reason!=="unavailable"||
       npc.restockSeconds===null)
      throw new Error("Customer has no active restock request.");
    if(!this.shopRequestClock)throw new Error("Shop request clock is unavailable.");
    this.shopRequestClock.shortenE2E(heroId,seconds);
    npc.restockSeconds=this.shopRequestClock.remaining(heroId);
  }

  /** Interact with a nearby, facing petitioner even during a safe browsing
   * stroll. Opening the dialog pauses that customer's visual walk. */
  nearbyBeggarId(position:Vector3,direction:Vector3,maxDistance=3.1):string|null {
    const facing=Math.hypot(direction.x,direction.z);
    if(facing<0.01)return null;
    const candidates=[...this.npcs.values()].filter(npc=>
      npc.visitor.status==="at-shop"&&npc.intent?.reason==="cannot-afford"&&
      npc.restockSeconds!==null&&npc.phase!=="leaving");
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
    this.queueCustomerBark(npc,"credit-granted",npc.wishItem);
    this.clearWish(npc);
    this.beginLeaving(npc);
    npc.root.metadata.shoppingPhase="leaving-with-credit";
  }

  dismissBeggar(heroId:string):void {
    const npc=this.npcs.get(heroId);
    if(npc?.intent?.reason==="cannot-afford"&&npc.phase!=="leaving"){
      this.queueCustomerBark(npc,"refused",npc.wishItem);
      this.leaveUnserved(npc);
    }
  }

  /** Real active stockout and credit requests for the small player HUD.
   * No AI state or timer changes: never count expired/departing customers.
   */
  activeServiceRequests():LiveServiceRequest[]{
    const live:LiveServiceRequest[]=[];
    for(const npc of this.npcs.values()){
      const reason=npc.intent?.reason;
      if(npc.phase==="leaving"||npc.visitor.status!=="at-shop"||
         (reason!=="unavailable"&&reason!=="cannot-afford")||
         !npc.wishBubble||!npc.wishItem||
         npc.restockSeconds===null||npc.restockSeconds<=0)continue;
      live.push({heroId:npc.visitor.id,itemId:npc.wishItem,reason,
        secondsRemaining:npc.restockSeconds});
    }
    return live;
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
      const mesh=(item.id==="healing-herb"||item.id==="mana-potion")
        ? MeshBuilder.CreateCylinder("npc-carried-"+npc.visitor.id+"-"+position,
          {height:0.27,diameter:0.2},this.scene)
        : item.id==="bread"
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
      // A payment gesture is triggered by an already confirmed sale receipt.
      npc.confirmedAction="paid";
      npc.confirmedSeconds=.95;
      npc.root.metadata.confirmedPayments=
        Number(npc.root.metadata.confirmedPayments??0)+1;
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

  private updateStep(delta:number):void {
    if(this.worldPaused)return; // World clock is frozen; never simulate a scene frame.
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
      const standing=String(npc.root.metadata.shoppingPhase??"");
      if(npc.idleYieldCooldown>0||
         !canYieldShopperSpot(npc.phase,standing,
           npc.route[npc.waypoint]!==undefined))continue;
      const shelfWaiter=standing==="waiting-for-shelf";
      const requestRoamer=standing==="roaming-request";
      const requestWaiting=["waiting-for-restock","waiting-for-credit",
        "waiting-for-restock-overflow","waiting-for-credit-overflow"].includes(standing);
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
      if(requestWaiting){
        // An active petitioner can move aside from an approaching buyer
        // without silently becoming an idle customer or losing the request.
        if(!npc.requestActive)continue;
        this.roamWhileRequesting(npc);
        if(npc.route.length)npc.idleYieldCooldown=8;
        continue;
      }
      const destination=this.queuePosition(npc.slot,npc,idle);
      const route=destination&&this.layout?pathToShopGoal(idle,
        {x:destination.x,z:destination.z},this.layout,this.room):null;
      npc.idleYieldCooldown=8;
      if(!route||!route.waypoints.length)continue;
      npc.phase="browsing";npc.toQueue=true;
      npc.route=route.waypoints.map(p=>new Vector3(p.x,0,p.z));
      npc.waypoint=0; npc.blockedSeconds=0;
      npc.root.metadata.phase=npc.phase;
      npc.root.metadata.shoppingPhase=shelfWaiter
        ?"clearing-shelf-aisle":requestRoamer
          ?"walking-to-request-roam":"clearing-aisle";
    }
    const gateFlow:Record<GateSide,"entering"|"leaving">={
      level4:gateFlowDirection("level4",gateActors),
      level6:gateFlowDirection("level6",gateActors),
    };
    for (const npc of this.npcs.values()) {
      const beforeMove={x:npc.root.position.x,z:npc.root.position.z};
      if(npc.visitor.id===this.engagedBeggarId){
        npc.root.metadata.movementMode="talking";
        this.animate(npc,delta,beforeMove);
        continue;
      }
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
          npc.restockSeconds??RESTOCK_WAIT_SECONDS,
          npc.root.metadata.shoppingPhase==="leaving-upset");
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
         npc.root.metadata.shoppingPhase==="idle-route-blocked"||
         npc.root.metadata.shoppingPhase==="shelf-route-blocked")){
        // A missing destination is temporary: stock and furniture stay
        // authoritative while visual capacity is re-evaluated periodically.
        npc.wait-=delta;
        if(npc.wait<=0)this.beginBrowsing(npc);
      }
      if(npc.phase==="queueing"&&
         npc.root.metadata.shoppingPhase==="checkout-overflow-wait"){
        npc.wait-=delta;
        if(npc.wait<=0)this.beginBrowsing(npc);
      }
      if(npc.phase==="leaving"&&npc.root.metadata.shoppingPhase==="blocked-exit"){
        npc.wait-=delta;
        if(npc.wait<=0)this.beginLeaving(npc);
      }
      const requestPhase=String(npc.root.metadata.shoppingPhase??"");
      const waitingForRequest=[
        "waiting-for-restock","waiting-for-credit",
        "waiting-for-restock-overflow","waiting-for-credit-overflow",
      ].includes(requestPhase);
      // A request expires even while its owner is walking around, or when
      // every station is full. Neither rerouting nor layout changes reset it.
      if(npc.restockSeconds!==null){
        const saved=this.shopRequestClock?.remaining(npc.visitor.id);
        if(saved!==null&&saved!==undefined)npc.restockSeconds=saved;
        npc.root.metadata.restockRemaining=Math.ceil(npc.restockSeconds);
        // Only the scheduled world event can expire the real customer.
      }
      if(npc.phase==="queueing"&&waitingForRequest&&
         npc.restockSeconds!==null){
        if(!npc.requestActive){
          npc.requestActive=true;
          npc.wait=5.0+(npc.slot%4)*0.7;
        }
        npc.wait-=delta;
        if(npc.wait<=0)this.roamWhileRequesting(npc);
      }
      if(npc.phase==="queueing"&&requestPhase==="roaming-request"&&
         npc.restockSeconds!==null){
        npc.wait-=delta;
        if(npc.wait<=0)this.roamWhileRequesting(npc);
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
            // Only a successful authoritative stock reservation starts the
            // reaching animation. Failed attempts never fabricate a pickup.
            // The store may synchronously replan the NPC, so don't overwrite
            // the new route or shopping phase after this callback.
            npc.confirmedAction="pickup";
            npc.confirmedSeconds=1.15;
            npc.root.metadata.confirmedPickups=
              Number(npc.root.metadata.confirmedPickups??0)+1;
            this.queueCustomerBark(npc,"pickup",item.itemId);
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
        const yielding=!!transit&&mustYieldAtGate(transit,gateFlow[transit.gate])&&
          !canShareGateLanes(transit,gateActors);
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
    this.showNextCustomerBark();
  }

  private releaseShelf(npc:NpcVisual):void{
    this.serviceSpots.release(npc.visitor.id);
  }

  private beginEntering(npc: NpcVisual, slot: number, fromOutside: boolean): void {
    this.releaseShelf(npc);
    npc.routeProgress=null;
    npc.trafficReroutes=0;
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

  private beginLeaving(npc: NpcVisual, replan=false): void {
    const desiredGate=npc.visitor.status === "expedition" ? "level6" : "level4";
    const outside=isInExitCorridor({
      x:npc.root.position.x,z:npc.root.position.z,
    },CORRIDOR_INNER_Z);
    // An outgoing visitor must not turn back toward the shop merely because
    // another customer paid, the day ended, or furniture changed behind them.
    // A change of destination gate is safe only while still inside the shop.
    if(npc.phase==="leaving" && npc.route[npc.waypoint] &&
        (outside || (!replan && npc.gateSide===desiredGate)))return;
    this.releaseShelf(npc);
    npc.routeProgress=null;
    npc.phase="leaving";
    if(outside){
      // If an entering actor becomes a departing one mid-corridor, leave
      // through the corridor they are physically in. Never plan a return
      // across the 2.4m corridor's walls to reach a preferred gate.
      npc.gateSide=npc.root.position.x<0?"level4":"level6";
      npc.route=[new Vector3(npc.root.position.x,0,CORRIDOR_OUTER_Z)];
    }else{
      npc.gateSide=desiredGate;
      const gateX=gateTravelLane(npc.gateSide,"leaving");
      const from={x:npc.root.position.x,z:npc.root.position.z};
      const route=this.layout?pathToShopGoal(from,{
        x:gateX,z:CORRIDOR_INNER_Z,
      },this.layout,this.room):null;
      if(this.layout&&!route){
        npc.route=[];
        npc.waypoint=0;
        npc.root.metadata.shoppingPhase="blocked-exit";
        npc.wait=1.5+(npc.slot%3)*.3;
        npc.root.metadata.phase=npc.phase;
        return;
      }
      npc.route=[
        ...(route?.waypoints.map(point=>new Vector3(point.x,0,point.z))
          ??[new Vector3(gateX,0,CORRIDOR_INNER_Z)]),
        new Vector3(gateX,0,CORRIDOR_OUTER_Z),
      ];
    }
    npc.waypoint=0;
    npc.blockedSeconds=0;
    npc.root.metadata.phase=npc.phase;
    npc.root.metadata.gateSide=npc.gateSide;
    npc.root.metadata.shoppingPhase="walking-out";
  }

  /** Each unsatisfied customer owns a single, world-anchored request bubble.
   * Its SVG symbol matches the stocking hotbar and wholesale UI. */
  private showWish(npc:NpcVisual,itemId:ItemId,begging=false):void {
    const fresh=npc.wishItem!==itemId||
      !npc.wishBubble||npc.wishBubble.root.classList.contains("is-begging")!==begging;
    if(!npc.wishBubble)npc.wishBubble=createNpcWishBubble(itemId);
    setNpcWishItem(npc.wishBubble,itemId,begging);
    npc.wishItem=itemId;
    npc.root.metadata.wantedItemId=itemId;
    if(fresh)this.queueCustomerBark(npc,begging?"credit-request":"restock",itemId);
  }

  private clearWish(npc:NpcVisual):void {
    npc.wishBubble?.root.remove();
    npc.wishBubble=null;
    npc.wishItem=null;
    npc.restockSeconds=null;
    npc.requestActive=false;
    npc.roamLeg=0;
    npc.root.metadata.wantedItemId=null;
    npc.root.metadata.restockRemaining=null;
  }

  private leaveUnserved(npc:NpcVisual):void {
    const reason=npc.intent?.reason??"no-need";
    const upset=reason==="unavailable";
    if(upset)this.queueCustomerBark(npc,"unserved",npc.wishItem);
    if(reason==="no-need")this.queueCustomerBark(npc,"no-need");
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

  /** A shelf can be temporarily unreachable because of furniture, traffic
   * or an obstructed access point. Route the shopper to a separate safe idle
   * stand and retry. Never silently mark a still-interested buyer as "waiting
   * for next day" and never consume their basket or reserve any stock here.
   */
  private deferShelfRoute(npc:NpcVisual,slotId:string):void {
    const from={x:npc.root.position.x,z:npc.root.position.z};
    const stand=this.queuePosition(npc.slot,npc,from);
    const route=stand&&this.layout?pathToShopGoal(from,
      {x:stand.x,z:stand.z},this.layout,this.room):null;
    npc.phase=route?"browsing":"queueing";
    npc.toQueue=!!route;
    npc.route=route?.waypoints.map(p=>new Vector3(p.x,0,p.z))??[];
    npc.waypoint=0;
    npc.wait=1.1+(npc.slot%4)*0.2;
    npc.root.metadata.shoppingTargetSlot=slotId;
    npc.root.metadata.checkoutQueueIndex=-1;
    npc.root.metadata.shoppingPhase=route
      ?"walking-to-shelf-retry-spot":"shelf-route-blocked";
    npc.root.metadata.phase=npc.phase;
  }

  /** Restock and begging requests stay visible while their owner explores
   * quiet, reachable floor rather than occupying a fixed petition pocket for
   * an entire minute. This is visual only: no changes to money, needs or RNG.
   * If the store is congested, stay in the last safe spot and retry later.
   */
  private roamWhileRequesting(npc:NpcVisual):void {
    if(!this.layout||npc.restockSeconds===null||!npc.requestActive)return;
    const origin={x:npc.root.position.x,z:npc.root.position.z};
    const route=this.serviceSpots.reserve(npc.visitor.id,"roam",origin,
      this.layout,this.room,{
        ...this.otherServiceOccupancy(npc),
        preferredIndex:npc.slot*7+npc.roamLeg*11,
        avoid:origin,
      })?.route??null;
    npc.roamLeg++;
    npc.root.metadata.roamLeg=npc.roamLeg;
    npc.blockedSeconds=0;
    npc.routeProgress=null;
    npc.waypoint=0;
    npc.wait=8+(npc.slot%3)*1.5;
    npc.toQueue=true;
    npc.phase=route?"browsing":"queueing";
    npc.route=route?.waypoints.map(point=>new Vector3(point.x,0,point.z))??[];
    npc.root.metadata.shoppingPhase=route
      ?"walking-to-request-roam":"roaming-request";
    npc.root.metadata.phase=npc.phase;
  }

  private beginBrowsing(npc:NpcVisual):void {
    this.releaseShelf(npc);
    npc.routeProgress=null;
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
      // When all reserved stockout pockets are occupied, use a genuine
      // side waiting destination instead of staying in the shelf aisle.
      const overflowRoute=waitRoute?null:this.serviceOverflowRoute(npc);
      const safeRoute=waitRoute??overflowRoute;
      // A real petition starts once the customer reaches a reserved safe
      // waiting destination, not in the doorway or while rerouting.
      // Saved requests retain their original deadline after reopening.
      const remaining=this.shopRequestClock?.remaining(npc.visitor.id);
      if(remaining!==null&&remaining!==undefined)npc.restockSeconds=remaining;
      this.showWish(npc,npc.intent.wantedItemId,begging);
      npc.root.metadata.restockRemaining=Math.ceil(
        npc.restockSeconds??RESTOCK_WAIT_SECONDS);
      npc.root.metadata.shoppingTargetSlot=null;
      npc.root.metadata.checkoutQueueIndex=-1;
      npc.toQueue=true;
      npc.route=(safeRoute?.waypoints??[]).map(p=>new Vector3(p.x,0,p.z));
      npc.waypoint=0;
      npc.phase=safeRoute?"browsing":"queueing";
      npc.wait=0.5;
      npc.root.metadata.shoppingPhase=waitRoute
        ?(begging?"walking-to-credit-wait":"walking-to-restock-wait")
        :overflowRoute
          ?(begging?"walking-to-credit-overflow":"walking-to-restock-overflow")
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
    if(item&&(!slot||!this.layout||!this.shop)){
      this.deferShelfRoute(npc,item.slotId);
      return;
    }
    if(item&&slot&&this.layout&&this.shop){
      const pointForShelf=this.shop.shelfAccessPoint(slot);
      // Reserve the entire physical shelf, not individual stock slots.
      // Adjacent access points overlap once shoulder/arm meshes are included;
      // only one browser may reach a shelf at a time. Others wait off-aisle.
      const shelfAccessBusy=this.serviceSpots.shelfBusyFor(
        slot.shelfId,npc.visitor.id);
      if(shelfAccessBusy){
        // A shelf waiter who moved aside for traffic must stay at the cleared
        // location until the shelf becomes available. Otherwise the next
        // half-second retry sends them straight back into the same bottleneck.
        if(npc.idleYieldCooldown>0&&
           npc.root.metadata.shoppingPhase==="waiting-for-shelf"){
          npc.phase="queueing";
          npc.route=[];
          npc.waypoint=0;
          npc.toQueue=false;
          npc.wait=Math.min(0.8,npc.idleYieldCooldown);
          npc.root.metadata.shoppingTargetSlot=item.slotId;
          npc.root.metadata.phase=npc.phase;
          return;
        }
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
      const reserved=this.serviceSpots.reserveShelfAccess(
        npc.visitor.id,slot.shelfId,slot.index,origin,this.layout,this.room,
        this.otherServiceOccupancy(npc));
      if(reserved){
        npc.phase="browsing";npc.toQueue=false;
        npc.route=reserved.route.waypoints.map(p=>new Vector3(p.x,0,p.z));
        npc.waypoint=0;
        npc.root.metadata.shoppingTargetSlot=item.slotId;
        npc.root.metadata.shoppingPhase="approaching-shelf";
        npc.root.metadata.phase=npc.phase;
        paintIdentity(npc,this.portraits);
        return;
      }
      this.deferShelfRoute(npc,item.slotId);
      return;
    }
    const queuePoints=this.layout?checkoutQueuePoints(this.layout,{x:0,z:-1},this.carts.length,this.room):[];
    const checkoutTarget=checkoutIndex>=0?queuePoints[checkoutIndex]:null;
    const allocatedCheckout=checkoutTarget&&this.layout
      ?this.serviceSpots.reserve(npc.visitor.id,"checkout",origin,this.layout,this.room,{
          ...this.otherServiceOccupancy(npc),checkoutTarget,
        }):null;
    const target=checkoutIndex>=0?allocatedCheckout?.point:
      this.queuePosition(npc.slot,npc);
    // A customer who already reached safe checkout overflow must not
    // shuffle between different waiting spots on each retry while the
    // checkout queue is still full. Replan as soon as capacity appears.
    if(!target&&checkoutIndex>=0&&
       npc.root.metadata.shoppingPhase==="checkout-overflow-wait"){
      npc.phase="queueing";npc.route=[];npc.waypoint=0;
      npc.wait=1.4; npc.toQueue=false;
      npc.root.metadata.phase=npc.phase;
      return;
    }
    const route=checkoutIndex>=0?allocatedCheckout?.route??null:
      target&&this.layout?pathToShopGoal(origin,
        {x:target.x,z:target.z},this.layout,this.room):null;
    const overflow=checkoutIndex>=0&&!route
      ?this.serviceOverflowRoute(npc):null;
    const safeRoute=route??overflow;
    // When a buyer advances to a newly freed checkout position, move
    // directly along the unobstructed queue lane, not out and back via A*.
    const oldIndex=Number(npc.root.metadata.checkoutQueueIndex);
    const queueAdvance=checkoutIndex>=0&&!!route&&!!target&&
      Number.isSafeInteger(oldIndex)&&oldIndex>checkoutIndex&&
      ["awaiting-checkout","walking-to-checkout"].includes(
        String(npc.root.metadata.shoppingPhase??""))&&
      shopSegmentClear(origin,{x:target.x,z:target.z},this.layout!,this.room);
    npc.phase=safeRoute?"browsing":"queueing";npc.toQueue=!!safeRoute;
    npc.wait=safeRoute?0:1.2+(npc.slot%4)*.25;
    npc.route=queueAdvance?[new Vector3(target!.x,0,target!.z)]:
      (safeRoute?.waypoints??[]).map(p=>new Vector3(p.x,0,p.z));
    npc.waypoint=0;
    npc.root.metadata.shoppingTargetSlot=null;
    npc.root.metadata.shoppingPhase=checkoutIndex>=0
      ? (route?"walking-to-checkout":overflow?"walking-to-checkout-overflow":
          target?"checkout-route-blocked":"checkout-capacity-full")
      : (route?"walking-to-wait":target?"idle-route-blocked":"idle-capacity-full");
    npc.root.metadata.checkoutQueueIndex=checkoutIndex;
    npc.root.metadata.phase=npc.phase;
    paintIdentity(npc,this.portraits);
  }

  private otherServiceOccupancy(npc:NpcVisual):{
    occupied:ShopPoint[];destinations:ShopPoint[];
  }{
    const others=[...this.npcs.values()].filter(other=>other!==npc);
    return {
      occupied:others.map(other=>({
        x:other.root.position.x,z:other.root.position.z,
      })),
      destinations:others.map(other=>other.route.at(-1))
        .filter((point):point is Vector3=>point!==undefined)
        .map(point=>({x:point.x,z:point.z})),
    };
  }

  private nearShelfWaitingRoute(npc:NpcVisual,target:ShopPoint):ShopperRoute|null{
    if(!this.layout)return null;
    return this.serviceSpots.reserve(npc.visitor.id,"shelf-wait",
      {x:npc.root.position.x,z:npc.root.position.z},this.layout,this.room,{
        ...this.otherServiceOccupancy(npc),shelfAccess:target,
      })?.route??null;
  }
  private offAisleWaitingRoute(npc:NpcVisual):ShopperRoute|null{
    if(!this.layout)return null;
    const role=shopperVisualAction(npc.intent,false)==="beg"?"credit":"restock";
    return this.serviceSpots.reserve(npc.visitor.id,role,
      {x:npc.root.position.x,z:npc.root.position.z},this.layout,this.room,{
        ...this.otherServiceOccupancy(npc),preferredIndex:npc.slot+npc.trafficReroutes,
      })?.route??null;
  }
  private serviceOverflowRoute(npc:NpcVisual):ShopperRoute|null{
    if(!this.layout)return null;
    return this.serviceSpots.reserve(npc.visitor.id,"overflow",
      {x:npc.root.position.x,z:npc.root.position.z},this.layout,this.room,{
        ...this.otherServiceOccupancy(npc),preferredIndex:npc.slot,
      })?.route??null;
  }
  private queuePosition(slot:number,npc:NpcVisual,avoid?:ShopPoint):Vector3|null{
    if(!this.layout)return null;
    const result=this.serviceSpots.reserve(npc.visitor.id,"idle",
      {x:npc.root.position.x,z:npc.root.position.z},this.layout,this.room,{
        ...this.otherServiceOccupancy(npc),preferredIndex:slot,avoid,
      });
    return result?new Vector3(result.point.x,0,result.point.z):null;
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
      if(npc.phase==="browsing"&&(
        phase==="walking-to-restock-wait"||phase==="walking-to-credit-wait"||
        phase==="walking-to-restock-overflow"||phase==="walking-to-credit-overflow"))
        npc.trafficReroutes++;
      npc.blockedSeconds=0;
      npc.routeProgress=null;
      this.beginBrowsing(npc);
      return true;
    }
    if(npc.phase==="leaving"&&npc.blockedSeconds>5){
      npc.blockedSeconds=0;
      this.beginLeaving(npc,true);
      return true;
    }
    return false;
  }

  private move(npc: NpcVisual, delta: number): void {
    const target=npc.route[npc.waypoint];
    if(!target){
      npc.walkSpeed=0;
      if(npc.phase==="entering"){
        this.beginBrowsing(npc);
      }else if(npc.phase==="browsing"){
        if(npc.toQueue){
          if(npc.root.metadata.shoppingPhase==="checkout-route-blocked"||
            npc.root.metadata.shoppingPhase==="idle-route-blocked")return;
          npc.phase="queueing";
          npc.routeProgress=null;
          npc.trafficReroutes=0;
          const clearingShelf=npc.root.metadata.shoppingPhase==="clearing-shelf-aisle";
          if(clearingShelf)npc.wait=0.7;
          if(npc.root.metadata.shoppingPhase==="walking-to-request-roam")
            npc.wait=8+(npc.slot%4)*1.4;
          const arrivedAtRequestStation=[
            "walking-to-restock-wait","walking-to-credit-wait",
            "walking-to-restock-overflow","walking-to-credit-overflow",
          ].includes(String(npc.root.metadata.shoppingPhase??""));
          npc.root.metadata.shoppingPhase=clearingShelf
            ?"waiting-for-shelf"
            :npc.root.metadata.shoppingPhase==="walking-to-shelf-retry-spot"
              ?"shelf-route-blocked"
            :npc.root.metadata.shoppingPhase==="walking-to-restock-wait"
            ?"waiting-for-restock"
            :npc.root.metadata.shoppingPhase==="walking-to-restock-overflow"
              ?"waiting-for-restock-overflow"
            :npc.root.metadata.shoppingPhase==="walking-to-credit-wait"
              ?"waiting-for-credit"
            :npc.root.metadata.shoppingPhase==="walking-to-credit-overflow"
              ?"waiting-for-credit-overflow"
            :npc.root.metadata.shoppingPhase==="walking-to-request-roam"
              ?"roaming-request"
            :npc.root.metadata.shoppingPhase==="walking-to-checkout-overflow"
              ?"checkout-overflow-wait"
            :checkoutQueueIndex(this.carts,npc.visitor.id)>=0
              ?"awaiting-checkout":"waiting-for-next-day";
          if(arrivedAtRequestStation&&npc.restockSeconds===null&&
             npc.intent?.wantedItemId&&
             (npc.intent.reason==="unavailable"||npc.intent.reason==="cannot-afford")){
            npc.restockSeconds=this.shopRequestClock?.start(npc.visitor.id,
              npc.intent.wantedItemId,npc.intent.reason)??RESTOCK_WAIT_SECONDS;
            npc.root.metadata.restockRemaining=Math.ceil(npc.restockSeconds);
          }
        }else{
          npc.phase="considering";
          npc.wait=1.1+(npc.slot%3)*0.35;
          npc.root.metadata.shoppingPhase="considering-item";
        }
        npc.root.metadata.phase=npc.phase;
      }else if(npc.phase==="leaving"){
        if(npc.root.position.z>=CORRIDOR_OUTER_Z-0.12){
          this.completedExits.push({heroId:npc.visitor.id,
            outerGateZ:npc.root.position.z});
          this.dispose(npc);
        }
        else npc.root.metadata.shoppingPhase="blocked-exit";
      }
      return;
    }
    const from={x:npc.root.position.x,z:npc.root.position.z};
    const dx=target.x-from.x,dz=target.z-from.z,distance=Math.hypot(dx,dz);
    npc.routeProgress=trackWaypointProgress(npc.routeProgress,
      {x:target.x,z:target.z},from,delta);
    const shoppingPhase=String(npc.root.metadata.shoppingPhase??"");
    const travellingToPetition=[
      "walking-to-restock-wait","walking-to-credit-wait",
      "walking-to-restock-overflow","walking-to-credit-overflow",
    ].includes(shoppingPhase);
    if(npc.phase==="browsing"&&travellingToPetition&&
      npc.routeProgress.stagnantSeconds>=6){
      // Alternating tiny forward/backward steps can masquerade as progress.
      // Switch to another real reserved pocket instead of endlessly circling.
      // No sales, stock, wait timers or GameStore data are changed here.
      npc.trafficReroutes++;
      npc.root.metadata.trafficReroutes=npc.trafficReroutes;
      npc.routeProgress=null;
      npc.blockedSeconds=0;
      this.beginBrowsing(npc);
      return;
    }
    const others=[...this.npcs.values()].filter(other=>other!==npc);
    const occupied=others.map(other=>({
      x:other.root.position.x,z:other.root.position.z,
    }));
    // A service claim protects a *settled* customer, not the entire route.
    // Customers travelling to different stations may briefly pass through
    // each other after a traffic stall, but never through a stationary buyer
    // at checkout, a waiting petitioner or a shopper inspecting a shelf.
    const protectedOccupied=others.filter(other=>{
      if(other.phase==="considering")return true;
      const claim=this.serviceSpots.claim(other.visitor.id);
      return !!claim&&other.route[other.waypoint]===undefined&&
        Math.hypot(other.root.position.x-claim.point.x,
          other.root.position.z-claim.point.z)<NPC_CENTER_CLEARANCE*0.5;
    }).map(other=>({
      x:other.root.position.x,z:other.root.position.z,
    }));
    if(distance<=NPC_FINAL_WAYPOINT_RADIUS){
      const heldByNeighbor=occupied.some(other=>
        Math.hypot(other.x-target.x,other.z-target.z)<PERSONAL_SPACE);
      const claim=this.serviceSpots.claim(npc.visitor.id);
      const isReservedDestination=!!claim&&
        Math.hypot(claim.point.x-target.x,claim.point.z-target.z)<0.3;
      // Even after a traffic stall, a visitor must not ghost into a claimed
      // checkout, stockout, credit or shelf waiting position.
      if((heldByNeighbor&&isReservedDestination)||
        !canFinishShopWaypoint(distance,heldByNeighbor,npc.blockedSeconds)){
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
      if(npc.waypoint===npc.route.length)npc.walkSpeed=0;
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
    const claim=this.serviceSpots.claim(npc.visitor.id);
    const finalServiceApproach=!!claim&&
      Math.hypot(target.x-claim.point.x,target.z-claim.point.z)<0.3&&
      Math.hypot(from.x-claim.point.x,from.z-claim.point.z)<
        NPC_CENTER_CLEARANCE+0.25;
    // Apply acceleration to actual pedestrian displacement, not only the leg
    // animation. Brake only for the last goal: intermediate waypoints from
    // pathfinding are corners, not reasons to stop and restart.
    npc.walkSpeed=easedNpcWalkSpeed(npc.walkSpeed,distance,delta,
      npc.waypoint===npc.route.length-1,WALK_SPEED);
    const travelStep=Math.min(distance,npc.walkSpeed*delta);
    const move=shopCrowdStep(from,{x:target.x,z:target.z},occupied,
      travelStep,walkable,npc.blockedSeconds,!inGateApproach&&from.z<=6.5,
      finalServiceApproach
        ?Number.POSITIVE_INFINITY
        :inGateTrafficThroat(from)
          ?NPC_GATE_SOFT_PASS_AFTER_SECONDS:NPC_SOFT_PASS_AFTER_SECONDS,
      protectedOccupied);
    const proposed=move.point;
    if(!proposed){
      npc.blockedSeconds+=delta;
      npc.root.metadata.blockedSeconds=npc.blockedSeconds;
      npc.root.metadata.softPassing=false;
      // A blocked walker physically comes to a stop instead of instantly
      // resuming full-speed movement after every collision retry.
      npc.walkSpeed=Math.max(0,npc.walkSpeed-5.5*delta);
      const nearest={x:from.x+(dx/distance)*travelStep,
        z:from.z+(dz/distance)*travelStep};
      npc.root.metadata.movementMode=walkable(nearest)?"crowd-block":"static-block";
      // A *static* obstruction still requires a new path. NPC traffic alone
      // becomes nonblocking after a short wait via shopCrowdStep above.
      this.recoverTraffic(npc);
      return;
    }
    const direct={x:from.x+dx/distance*travelStep,
      z:from.z+dz/distance*travelStep};
    const steering=Math.hypot(proposed.x-direct.x,proposed.z-direct.z);
    // Count actual lack of progress. Steering around a person is normal
    // walking and must not trigger body-overlap escape mode by itself.
    npc.blockedSeconds=crowdStallSeconds(npc.blockedSeconds,delta,from,
      proposed,{x:target.x,z:target.z},move.softPass);
    npc.root.metadata.blockedSeconds=npc.blockedSeconds;
    npc.root.metadata.softPassing=move.softPass;
    npc.root.metadata.movementMode=move.softPass?"soft-pass":steering>0.015?"sidestep":"moving";
    if(!move.softPass&&this.recoverTraffic(npc))return;
    if(Math.hypot(proposed.x-from.x,proposed.z-from.z)>0.001){
      const facing=Math.atan2(proposed.x-from.x,proposed.z-from.z);
      npc.root.rotation.y=turnNpcToward(npc.root.rotation.y,facing,delta);
    }
    npc.root.position.x=proposed.x;
    npc.root.position.z=proposed.z;
  }

  private animate(npc: NpcVisual,delta:number,beforeMove:{x:number;z:number}): void {
    const motion=npcLocomotion(beforeMove,{
      x:npc.root.position.x,z:npc.root.position.z,
    },delta,WALK_SPEED);
    const shoppingPhase=String(npc.root.metadata.shoppingPhase??"");
    const conversing=npc.visitor.id===this.engagedBeggarId;
    // While inspecting an actual shelf slot, face the merchandise. During
    // an E-dialog face the player; neither rotation modifies movement goals.
    let lookAt:{x:number;z:number}|null=null;
    if(conversing){
      const camera=this.scene.activeCamera?.globalPosition;
      if(camera)lookAt={x:camera.x,z:camera.z};
    }else if(!motion.moving&&npc.phase==="considering"&&
      shoppingPhase==="considering-item"&&this.shop){
      const slotId=npc.intent?.items[npc.targetIndex]?.slotId;
      const mesh=slotId?[...this.shop.slotMeshes.keys()]
        .find(entry=>entry.name===slotId):undefined;
      if(mesh){
        const world=mesh.getAbsolutePosition();
        lookAt={x:world.x,z:world.z};
      }
    }else if(!motion.moving&&npc.phase==="queueing"&&
      shoppingPhase==="awaiting-checkout"&&this.layout){
      const till=getCounterPlacement(this.layout);
      lookAt={x:till.x,z:till.z};
    }
    if(lookAt){
      const dx=lookAt.x-npc.root.position.x;
      const dz=lookAt.z-npc.root.position.z;
      if(Math.hypot(dx,dz)>.5){
        npc.root.rotation.y=turnNpcToward(npc.root.rotation.y,
          Math.atan2(dx,dz),delta,conversing?4:3.2);
      }
    }
    // Leg cycles reflect physical displacement, even during queue changes.
    npc.animationTime+=delta*(motion.moving?motion.strideScale:0.3);
    npc.performanceTime+=delta;
    npc.confirmedSeconds=Math.max(0,npc.confirmedSeconds-delta);
    if(npc.confirmedSeconds===0)npc.confirmedAction=null;
    const pose=npcShopPose({
      phase:npc.phase,shoppingPhase,reason:npc.intent?.reason??"no-need",
      moving:motion.moving,
      time:npc.performanceTime,slot:npc.slot,
      carrying:npc.heldLines.length>0,
      confirmedAction:npc.confirmedAction,
      confirmedSeconds:npc.confirmedSeconds,conversing,
    });
    const swing=motion.moving
      ?Math.sin(npc.animationTime*8)*0.65
      :Math.sin(npc.animationTime*2)*0.035;
    npc.legs[0].rotation.x=swing;
    npc.legs[1].rotation.x=-swing;
    // Blend limb targets rather than popping from the walk cycle to a
    // request, inspection, pickup or confirmed-payment gesture.
    const weight=1-Math.exp(-delta*9);
    const blend=(current:number,target:number)=>
      current+(target-current)*weight;
    npc.arms[0].rotation.x=blend(npc.arms[0].rotation.x,
      -swing*.7+pose.leftArm);
    npc.arms[1].rotation.x=blend(npc.arms[1].rotation.x,
      swing*.7+pose.rightArm);
    npc.model.headPivot.rotation.x=blend(npc.model.headPivot.rotation.x,
      pose.headPitch);
    npc.model.headPivot.rotation.y=blend(npc.model.headPivot.rotation.y,
      pose.headYaw);
    npc.model.headPivot.rotation.z=blend(npc.model.headPivot.rotation.z,
      pose.headRoll);
    npc.torso.rotation.x=blend(npc.torso.rotation.x,pose.torsoLean);
    npc.torso.position.y=1.14+Math.sin(npc.animationTime*2)*
      (motion.moving?0.025:0.01);
    npc.torso.rotation.z=motion.moving?0:
      Math.sin(npc.animationTime*.6+npc.slot*.9)*.014;
    npc.root.position.y=0.6*Math.cos(swing)-0.6;
    npc.root.metadata.animatingWalk=motion.moving;
    npc.root.metadata.actualSpeed=Math.round(motion.speed*100)/100;
    npc.root.metadata.shopGesture=pose.gesture;
  }

  private dispose(npc: NpcVisual): void {
    this.presentationTrails.delete(npc.visitor.id);
    for(let i=this.customerBarkQueue.length-1;i>=0;i--)
      if(this.customerBarkQueue[i]?.heroId===npc.visitor.id)
        this.customerBarkQueue.splice(i,1);
    if(this.activeCustomerBark?.entry.heroId===npc.visitor.id){
      this.activeCustomerBark=null;
      this.customerBubble.root.hidden=true;
    }
    this.releaseShelf(npc);
    this.clearWish(npc);
    this.clearSaleTag(npc);
    this.syncCarriedProducts(npc, []);
    npc.root.dispose(false, true);
    this.npcs.delete(npc.visitor.id);
  }
}
