import {BUYBACK_DOCK} from "./buybackChestPlacement.ts";
import type {ShopRoomGeometry} from "./shopRoomGeometry.ts";
import {getCounterPlacement,type ShopLayout} from "./shopLayout.ts";
import {shelfServicePoint,SHELF_SLOT_COUNT} from "./furnitureRegistry.ts";
import {checkoutQueuePoints} from "./checkoutQueue.ts";
import {idleShopPositions,NPC_STATION_CLEARANCE} from "./npcTraffic.ts";
import {restockWaitingPositions} from "./restockWaitingPlaces.ts";
import {shelfWaitingCandidates} from "./shelfWaitingPlaces.ts";
import {createShopRoutePlanner,isObstructed,pathToShelfAccess,type ShopPoint,type ShopperRoute} from "./shopperNavigation.ts";

/** Presentation-only reservations. GameStore, carts, stock and gold remain
 * authoritative. One visitor owns one destination, regardless of whether
 * they are paying, requesting restock/credit or waiting for a busy shelf. */
export type ShopServiceRole =
  "buyback"|"checkout"|"restock"|"credit"|"shelf-browse"|"shelf-wait"|"overflow"|"idle"|"roam";
export type ShopWaitingRole=Exclude<ShopServiceRole,"shelf-browse">;
export interface ShopServiceClaim{
  readonly heroId:string;
  readonly role:ShopServiceRole;
  readonly point:ShopPoint;
}
export interface ShopServiceRequest{
  readonly occupied?:readonly ShopPoint[];
  readonly destinations?:readonly ShopPoint[];
  readonly preferredIndex?:number;
  readonly checkoutTarget?:ShopPoint;
  readonly shelfAccess?:ShopPoint;
  readonly avoid?:ShopPoint;
}
export interface ReservedShopRoute{
  readonly point:ShopPoint;
  readonly route:ShopperRoute;
}

const CLEARANCE=NPC_STATION_CLEARANCE;
const dist=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const isFinitePoint=(p:ShopPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.z);

/** All candidate pools are derived from the same current moved-furniture /
 * excavated-room topology, once per geometry change. This is not called
 * from the rendering loop and does not write the save. */
export class ShopServiceSpots{
  private readonly claims=new Map<string,ShopServiceClaim>();
  private readonly shelfOwners=new Map<string,string>();
  private layoutSignature="";
  private idle:readonly ShopPoint[]=[];
  private idleCount=0;
  private restock:readonly ShopPoint[]=[];
  private roam:readonly ShopPoint[]=[];
  private checkout:readonly ShopPoint[]=[];

  configure(layout:ShopLayout,room?:ShopRoomGeometry):void {
    const signature=JSON.stringify([layout,room??null]);
    if(signature===this.layoutSignature)return;
    this.layoutSignature=signature;
    this.claims.clear();
    this.shelfOwners.clear();
    this.checkout=checkoutQueuePoints(layout,{x:0,z:-1},12,room);
    this.restock=restockWaitingPositions(layout,room);
    // Do not run 100 full navigation searches merely because one rock
    // was mined. Compute idle/overflow destinations lazily on actual demand.
    this.idle=[];this.idleCount=0;this.roam=[];
  }

  /** Same owner may use any slot on its shelf; no second customer may
   * claim an adjacent slot whose physical shoulder clearance overlaps. */
  shelfBusyFor(shelfId:string,heroId:string):boolean{
    const owner=this.shelfOwners.get(shelfId);
    return owner!==undefined&&owner!==heroId;
  }
  claimShelf(shelfId:string,heroId:string):boolean{
    if(this.shelfBusyFor(shelfId,heroId))return false;
    this.shelfOwners.set(shelfId,heroId);
    return true;
  }
  release(heroId:string):void {
    this.claims.delete(heroId);
    for(const [shelfId,owner] of this.shelfOwners)
      if(owner===heroId)this.shelfOwners.delete(shelfId);
  }
  clear():void {
    this.claims.clear();this.shelfOwners.clear();this.layoutSignature="";
    this.idle=[];this.idleCount=0;
  }
  private ensureIdle(layout:ShopLayout,room:ShopRoomGeometry|undefined,count:number):void {
    if(this.idleCount>=count)return;
    this.idleCount=Math.min(100,Math.max(24,count));
    this.idle=idleShopPositions(layout,this.idleCount,room);
    // Roaming visitors must not turn the queue, active shelf faces or
    // restock counters into another set of idle stations.
    const counter=getCounterPlacement(layout);
    this.roam=this.idle.filter(point=>{
      if(point.z>=2.1||point.z<=-5.85||
         dist(point,counter)<2.6)return false;
      if(this.checkout.some(q=>dist(point,q)<2.3)||
         this.restock.some(q=>dist(point,q)<1.85))return false;
      return layout.shelves.every(shelf=>Array.from({length:SHELF_SLOT_COUNT},(_,index)=>index).every(index=>{
        return dist(point,shelfServicePoint(shelf,index))>=1.95;
      }));
    });
  }
  claim(heroId:string):ShopServiceClaim|null{return this.claims.get(heroId)??null;}
  snapshot():readonly ShopServiceClaim[]{return [...this.claims.values()];}
  snapshotShelfOwners():readonly {shelfId:string;heroId:string}[]{
    return [...this.shelfOwners].map(([shelfId,heroId])=>({shelfId,heroId}));
  }
  /** Restore previously validated service places without route mutation. */
  restoreClaims(
    claims:readonly ShopServiceClaim[],
    shelves:readonly {readonly shelfId:string;readonly heroId:string}[],
    layout:ShopLayout,room?:ShopRoomGeometry,
  ):void{
    this.configure(layout,room);
    this.claims.clear();this.shelfOwners.clear();
    for(const claim of claims)this.claims.set(claim.heroId,{
      heroId:claim.heroId,role:claim.role,point:{...claim.point}});
    for(const shelf of shelves)this.shelfOwners.set(shelf.shelfId,shelf.heroId);
  }

  /** Reserve the actual shelf approach, not only the shelf ID.
   * A checkout / credit / restock / idle customer must not receive the same
   * endpoint while this browser is travelling or inspecting an item. Prefer
   * real alternative points on the same shelf face before postponing service.
   */
  reserveShelfAccess(
    heroId:string,shelfId:string,slotIndex:number,from:ShopPoint,
    layout:ShopLayout,room?:ShopRoomGeometry,request:ShopServiceRequest={},
  ):ReservedShopRoute|null {
    this.configure(layout,room);
    if(!heroId||!isFinitePoint(from)||this.shelfBusyFor(shelfId,heroId))
      return null;
    const occupied=[...(request.occupied??[]),...(request.destinations??[])];
    const otherClaims=[...this.claims.values()]
      .filter(claim=>claim.heroId!==heroId).map(claim=>claim.point);
    // Only *claimed* future destinations are exclusive. Unoccupied queue and
    // credit pockets are not permanent no-go zones for valid shelf layouts.
    const unavailable=[BUYBACK_DOCK,...occupied,...otherClaims];
    const route=pathToShelfAccess(from,layout,shelfId,slotIndex,room,
      point=>unavailable.every(other=>dist(point,other)>=CLEARANCE));
    if(!route)return null;
    const point=route.waypoints.at(-1)??from;
    if(!isFinitePoint(point)||unavailable.some(other=>dist(point,other)<CLEARANCE))
      return null;
    // One atomic handoff: releasing a previous destination also drops the
    // hero's previous shelf ownership, then binds both new claims together.
    this.release(heroId);
    if(!this.claimShelf(shelfId,heroId))return null;
    this.claims.set(heroId,{heroId,role:"shelf-browse",point});
    return {point,route};
  }

  /** Never fabricate a final waypoint or allow two future reservations to
   * overlap. Moving traffic also counts as occupancy when acquiring a new
   * claim; an already acquired claim persists until a phase/layout change.
   *
   * When no safe spot exists, return null and let the caller keep/retry its
   * capacity-full state. No teleport, ghost-through-furniture or stock mutation.
   */
  reserve(
    heroId:string,role:ShopWaitingRole,from:ShopPoint,
    layout:ShopLayout,room?:ShopRoomGeometry,request:ShopServiceRequest={},
  ):ReservedShopRoute|null{
    this.configure(layout,room);
    if(!heroId||!isFinitePoint(from)){
      this.release(heroId);return null;
    }
    const occupied=[...(request.occupied??[]),...(request.destinations??[])];
    const otherClaims=[...this.claims.values()].filter(x=>x.heroId!==heroId)
      .map(x=>x.point);
    const forbidden=role==="buyback"?[]:role==="checkout"?[BUYBACK_DOCK]:
      role==="restock"||role==="credit"?[BUYBACK_DOCK,...this.checkout]:
      [BUYBACK_DOCK,...this.checkout,...this.restock];
    if(role==="idle"||role==="overflow"||role==="roam")
      this.ensureIdle(layout,room,24);
    let candidates:readonly ShopPoint[];
    switch(role){
      case "buyback": candidates=[BUYBACK_DOCK];break;
      case "checkout":
        candidates=request.checkoutTarget?[request.checkoutTarget]:[];
        break;
      case "restock":
      case "credit": candidates=this.restock;break;
      case "shelf-wait":
        candidates=request.shelfAccess?shelfWaitingCandidates(request.shelfAccess):[];
        break;
      case "overflow":
        candidates=this.idle.filter(p=>p.z<=0.5);
        break;
      case "roam": candidates=this.roam;break;
      default: candidates=this.idle;
    }
    const count=Math.max(1,candidates.length);
    const start=((request.preferredIndex??0)%count+count)%count;
    const ordered=[...candidates.slice(start),...candidates.slice(0,start)];
    // First-free sent a visitor across the entire cave despite an empty
    // nearby waiting pocket. Check a few nearby reachable destinations and
    // rank their real walking routes instead of cycling static slot numbers.
    const ranked=role==="checkout"||role==="shelf-wait"?ordered:
      ordered.map((point,index)=>({point,index})).sort((a,b)=>
        dist(from,a.point)-dist(from,b.point)+(a.index-b.index)*.025)
        .map(entry=>entry.point);
    // Checkout is single file: settled/pending stations are temporary route
    // obstacles, not merely exclusive final destinations. Never share this
    // dynamic grid across NPCs or topology changes.
    const checkoutBlockers=role==="checkout"
      ?[...this.claims.values()].filter(claim=>
        claim.heroId!==heroId&&claim.role==="checkout"&&
        dist(from,claim.point)>.75).map(claim=>claim.point)
      :[];
    const routeTo=createShopRoutePlanner(layout,room,checkoutBlockers);
    let chosen:(ReservedShopRoute&{score:number})|null=null;
    let validCount=0;
    for(const point of ranked){
      if(!isFinitePoint(point)||isObstructed(point,layout,room)||
        request.avoid&&dist(point,request.avoid)<1.85||
        [...occupied,...otherClaims,...forbidden].some(p=>dist(point,p)<CLEARANCE))
        continue;
      // Restock/credit petitioners should not pace across the shop every
      // few seconds. Try a nearby pocket, otherwise retain their last stand.
      if(role==="roam"&&(dist(from,point)>3.8||
        (from.x*point.x<0&&Math.abs(from.x)>1.3&&Math.abs(point.x)>1.3)))
        continue;
      const route=routeTo(from,point);
      if(!route)continue;
      const actual=route.waypoints.at(-1)??from;
      if(dist(actual,point)>0.17)continue;
      if(role==="checkout"){
        this.release(heroId);
        this.claims.set(heroId,{heroId,role,point});
        return {point,route};
      }
      const score=role==="shelf-wait"
        ?route.length*.5+dist(point,request.shelfAccess!)*.85+
          dist(from,point)*.25
        :route.length*.5+dist(from,point)*.35;
      if(!chosen||score<chosen.score)chosen={point,route,score};
      // At most five verified, nearby alternatives for generic purposes.
      // This allocation is event-driven, never executed per render frame.
      if(++validCount>=5&&role!=="shelf-wait")break;
    }
    if(chosen){
      this.release(heroId);
      this.claims.set(heroId,{heroId,role,point:chosen.point});
      return {point:chosen.point,route:chosen.route};
    }
    if((role==="idle"||role==="overflow"||role==="roam")&&this.idleCount<100){
      this.ensureIdle(layout,room,100);
      return this.reserve(heroId,role,from,layout,room,request);
    }
    // If no local stroll is available, a requester must not lose their
    // existing reserved spot or be ordered to teleport across the shop.
    if(role!=="roam")this.release(heroId);
    return null;
  }
}
