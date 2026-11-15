import type {Level5Room} from "./level5Room.ts";
import type {ShopLayout} from "./shopLayout.ts";
import {checkoutQueuePoints} from "./checkoutQueue.ts";
import {idleShopPositions,NPC_CENTER_CLEARANCE} from "./npcTraffic.ts";
import {restockWaitingPositions} from "./restockWaitingPlaces.ts";
import {shelfWaitingCandidates} from "./shelfWaitingPlaces.ts";
import {isObstructed,pathToShopGoal,type ShopPoint,type ShopperRoute} from "./shopperNavigation.ts";

/** Presentation-only reservations. GameStore, carts, stock and gold remain
 * authoritative. One visitor owns one destination, regardless of whether
 * they are paying, requesting restock/credit or waiting for a busy shelf. */
export type ShopServiceRole =
  "checkout"|"restock"|"credit"|"shelf-wait"|"overflow"|"idle";
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

const CLEARANCE=NPC_CENTER_CLEARANCE+0.16;
const dist=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const isFinitePoint=(p:ShopPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.z);

/** All candidate pools are derived from the same current moved-furniture /
 * excavated-room topology, once per geometry change. This is not called
 * from the rendering loop and does not write the save. */
export class ShopServiceSpots{
  private readonly claims=new Map<string,ShopServiceClaim>();
  private layoutSignature="";
  private idle:readonly ShopPoint[]=[];
  private restock:readonly ShopPoint[]=[];
  private checkout:readonly ShopPoint[]=[];

  configure(layout:ShopLayout,room?:Level5Room):void {
    const signature=JSON.stringify([layout,room??null]);
    if(signature===this.layoutSignature)return;
    this.layoutSignature=signature;
    this.claims.clear();
    this.checkout=checkoutQueuePoints(layout,{x:0,z:-1},24,room);
    this.restock=restockWaitingPositions(layout,room);
    this.idle=idleShopPositions(layout,100,room);
  }

  release(heroId:string):void {this.claims.delete(heroId);}
  clear():void {this.claims.clear();this.layoutSignature="";}
  claim(heroId:string):ShopServiceClaim|null{return this.claims.get(heroId)??null;}
  snapshot():readonly ShopServiceClaim[]{return [...this.claims.values()];}

  /** Never fabricate a final waypoint or allow two future reservations to
   * overlap. Moving traffic also counts as occupancy when acquiring a new
   * claim; an already acquired claim persists until a phase/layout change.
   *
   * When no safe spot exists, return null and let the caller keep/retry its
   * capacity-full state. No teleport, ghost-through-furniture or stock mutation.
   */
  reserve(
    heroId:string,role:ShopServiceRole,from:ShopPoint,
    layout:ShopLayout,room?:Level5Room,request:ShopServiceRequest={},
  ):ReservedShopRoute|null{
    this.configure(layout,room);
    if(!heroId||!isFinitePoint(from)){
      this.release(heroId);return null;
    }
    const occupied=[...(request.occupied??[]),...(request.destinations??[])];
    const otherClaims=[...this.claims.values()].filter(x=>x.heroId!==heroId)
      .map(x=>x.point);
    const forbidden=role==="checkout"?[]:
      role==="restock"||role==="credit"?this.checkout:
      [...this.checkout,...this.restock];
    let candidates:readonly ShopPoint[];
    switch(role){
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
      default: candidates=this.idle;
    }
    const start=(request.preferredIndex??0)%Math.max(1,candidates.length);
    const ordered=[...candidates.slice(start),...candidates.slice(0,start)];
    // A shelf-waiter should wait close to its own shop shelf, rather than
    // take the first free pocket across the entire shop.
    let chosen:(ReservedShopRoute&{score:number})|null=null;
    for(const point of ordered){
      if(!isFinitePoint(point)||isObstructed(point,layout,room)||
        request.avoid&&dist(point,request.avoid)<1.85||
        [...occupied,...otherClaims,...forbidden].some(p=>dist(point,p)<CLEARANCE))
        continue;
      const route=pathToShopGoal(from,point,layout,room);
      if(!route)continue;
      const actual=route.waypoints.at(-1)??from;
      if(dist(actual,point)>0.17)continue;
      if(role!=="shelf-wait"){
        this.claims.set(heroId,{heroId,role,point});
        return {point,route};
      }
      const shelf=request.shelfAccess!;
      const score=route.length*.5+dist(point,shelf)*.85+dist(from,point)*.25;
      if(!chosen||score<chosen.score)chosen={point,route,score};
    }
    if(chosen){
      this.claims.set(heroId,{heroId,role,point:chosen.point});
      return {point:chosen.point,route:chosen.route};
    }
    this.release(heroId);
    return null;
  }
}
