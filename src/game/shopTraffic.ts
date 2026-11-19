import type {ShopServiceClaim} from "./shopServiceSpots.ts";
import type {WaypointProgress} from "./npcTraffic.ts";
import type {GateSide} from "./npcVisitors.ts";
import type {ShopPoint} from "./shopperNavigation.ts";
import type {ItemId} from "./economy.ts";

export type ShopActorPhase="entering"|"browsing"|"considering"|"queueing"|"leaving";
export interface ShopTrafficActor {
  readonly heroId:string;
  readonly x:number;
  readonly z:number;
  readonly yaw:number;
  readonly slot:number;
  readonly gateSide:GateSide;
  readonly phase:ShopActorPhase;
  readonly shoppingPhase:string;
  readonly shoppingReason:string;
  readonly shoppingTargetSlot:string|null;
  readonly checkoutQueueIndex:number;
  readonly route:readonly ShopPoint[];
  readonly waypoint:number;
  readonly toQueue:boolean;
  readonly intentKey:string;
  readonly targetIndex:number;
  readonly wait:number;
  readonly elapsed:number;
  readonly blockedSeconds:number;
  readonly routeProgress:WaypointProgress|null;
  readonly trafficReroutes:number;
  readonly idleYieldCooldown:number;
  readonly requestActive:boolean;
  readonly roamLeg:number;
  readonly restockSeconds:number|null;
  readonly wishItem:ItemId|null;
  readonly walkSpeed:number;
  readonly animationTime:number;
  readonly performanceTime:number;
  readonly browseSide:number;
}
/** The only durable checkpoint for the existing physical NPC motor.
 * Its world tick must match the authoritative clock. It owns NO gold,
 * stock, purchases, random rolls or dungeon state.
 */
export interface ShopTrafficCheckpoint {
  readonly day:number;
  readonly tick:number;
  readonly initialized:boolean;
  readonly actors:readonly ShopTrafficActor[];
  readonly claims:readonly ShopServiceClaim[];
  readonly shelfOwners:readonly {readonly shelfId:string;readonly heroId:string}[];
  readonly doorY:Readonly<Record<GateSide,number>>;
}
export function emptyShopTraffic(day:number,tick:number):ShopTrafficCheckpoint {
  return {day,tick,initialized:false,actors:[],claims:[],shelfOwners:[],
    doorY:{level4:0,level6:0}};
}

const fail=(path:string,message:string):never=>{
  throw new RangeError("Invalid shop traffic checkpoint: "+path+" "+message);
};
const obj=(value:unknown,path:string,keys:readonly string[]):Record<string,unknown>=>{
  if(!value||typeof value!=="object"||Array.isArray(value))
    fail(path,"must be an object");
  const result=value as Record<string,unknown>;
  if(Object.keys(result).length!==keys.length||
     keys.some(key=>!Object.hasOwn(result,key)))
    fail(path,"has missing or unexpected fields");
  return result;
};
const arr=(value:unknown,path:string,max:number):unknown[]=>{
  if(!Array.isArray(value)||value.length>max)fail(path,"must be a bounded array");
  return value;
};
const bounded=(v:unknown,path:string,min:number,max:number):number=>{
  if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)
    fail(path,"must be a bounded finite number");
  return v;
};
const int=(v:unknown,path:string,min:number,max:number):number=>{
  const n=bounded(v,path,min,max);
  if(!Number.isSafeInteger(n))fail(path,"must be a safe integer");
  return n;
};
const str=(v:unknown,path:string,max=120):string=>{
  if(typeof v!=="string"||v.length>max)fail(path,"must be a bounded string");
  return v;
};
const point=(raw:unknown,path:string):void=>{
  const p=obj(raw,path,["x","z"]);
  bounded(p.x,path+".x",-40,40);
  bounded(p.z,path+".z",-40,40);
};
const unique=(id:string,seen:Set<string>,path:string):void=>{
  if(!id||seen.has(id))fail(path,"must be a distinct nonempty ID");
  seen.add(id);
};
const ACTOR_FIELDS=[
  "heroId","x","z","yaw","slot","gateSide","phase",
  "shoppingPhase","shoppingReason","shoppingTargetSlot","checkoutQueueIndex",
  "route","waypoint","toQueue","intentKey","targetIndex","wait","elapsed",
  "blockedSeconds","routeProgress","trafficReroutes","idleYieldCooldown",
  "requestActive","roamLeg","restockSeconds","wishItem","walkSpeed",
  "animationTime","performanceTime","browseSide",
];
const ROLES=["checkout","restock","credit","shelf-browse","shelf-wait",
  "overflow","idle","roam"];
const PHASES=["entering","browsing","considering","queueing","leaving"];
const ITEMS=["bread","healing-herb","iron-sword","leather-vest",
  "steel-sword","chainmail"];
/** Saves reject incompatible/forged actors, orphaned claims and impossible
 * checkout/shelf ownership; never silently reset a corrupted route.
 */
export function validateShopTraffic(
  value:unknown,day:number,tick:number,
  heroIds:ReadonlySet<string>,shelfIds:ReadonlySet<string>,
):asserts value is ShopTrafficCheckpoint {
  const root=obj(value,"shopTraffic",[
    "day","tick","initialized","actors","claims","shelfOwners","doorY"]);
  if(int(root.day,"shopTraffic.day",1,1e12)!==day||
     int(root.tick,"shopTraffic.tick",0,Number.MAX_SAFE_INTEGER)!==tick)
    fail("shopTraffic","must match the current world day and tick");
  if(typeof root.initialized!=="boolean")fail("shopTraffic.initialized","must be boolean");
  const actors=arr(root.actors,"shopTraffic.actors",100);
  const claims=arr(root.claims,"shopTraffic.claims",100);
  const owners=arr(root.shelfOwners,"shopTraffic.shelfOwners",100);
  const door=obj(root.doorY,"shopTraffic.doorY",["level4","level6"]);
  for(const gate of ["level4","level6"])bounded(door[gate],"shopTraffic.doorY."+gate,-10,10);
  if(!root.initialized&&(actors.length||claims.length||owners.length))
    fail("shopTraffic","cannot contain uninitialized NPCs or claims");
  const actorIds=new Set<string>();
  const slots=new Set<number>();
  for(const [i,raw] of actors.entries()){
    const p="shopTraffic.actors["+i+"]";
    const actor=obj(raw,p,ACTOR_FIELDS);
    const id=str(actor.heroId,p+".heroId");
    unique(id,actorIds,p+".heroId");
    if(!heroIds.has(id))fail(p+".heroId","must be a living known adventurer");
    const slot=int(actor.slot,p+".slot",0,100);
    if(slots.has(slot))fail(p+".slot","must not be shared");
    slots.add(slot);
    for(const key of ["x","z"])bounded(actor[key],p+"."+key,-40,40);
    bounded(actor.yaw,p+".yaw",-10000,10000);
    if(!["level4","level6"].includes(actor.gateSide as string))
      fail(p+".gateSide","is not a gate");
    if(!PHASES.includes(actor.phase as string))fail(p+".phase","is unknown");
    str(actor.shoppingPhase,p+".shoppingPhase");
    str(actor.shoppingReason,p+".shoppingReason");
    if(actor.shoppingTargetSlot!==null)
      str(actor.shoppingTargetSlot,p+".shoppingTargetSlot");
    int(actor.checkoutQueueIndex,p+".checkoutQueueIndex",-1,100);
    const route=arr(actor.route,p+".route",512);
    route.forEach((v,j)=>point(v,p+".route["+j+"]"));
    int(actor.waypoint,p+".waypoint",0,route.length);
    if(typeof actor.toQueue!=="boolean")fail(p+".toQueue","must be boolean");
    str(actor.intentKey,p+".intentKey",30000);
    int(actor.targetIndex,p+".targetIndex",0,100);
    for(const key of ["wait","elapsed","blockedSeconds","idleYieldCooldown",
      "walkSpeed","animationTime","performanceTime"])
      bounded(actor[key],p+"."+key,-100000,100000);
    for(const key of ["trafficReroutes","roamLeg"])
      int(actor[key],p+"."+key,0,1000000);
    if(typeof actor.requestActive!=="boolean")fail(p+".requestActive","must be boolean");
    if(actor.routeProgress!==null){
      const rp=obj(actor.routeProgress,p+".routeProgress",[
        "target","closest","stagnantSeconds"]);
      point(rp.target,p+".routeProgress.target");
      bounded(rp.closest,p+".routeProgress.closest",0,100000);
      bounded(rp.stagnantSeconds,p+".routeProgress.stagnantSeconds",0,100000);
    }
    if(actor.restockSeconds!==null)
      bounded(actor.restockSeconds,p+".restockSeconds",0,100);
    if(actor.wishItem!==null&&!ITEMS.includes(actor.wishItem as string))
      fail(p+".wishItem","is not a known product");
    if(actor.browseSide!==-1&&actor.browseSide!==1)fail(p+".browseSide","is invalid");
  }
  const claimed=new Set<string>();
  const claimById=new Map<string,string>();
  for(const [i,raw] of claims.entries()){
    const p="shopTraffic.claims["+i+"]";
    const claim=obj(raw,p,["heroId","role","point"]);
    const heroId=str(claim.heroId,p+".heroId");
    unique(heroId,claimed,p+".heroId");
    if(!actorIds.has(heroId))fail(p+".heroId","has no active physical actor");
    if(!ROLES.includes(claim.role as string))fail(p+".role","is invalid");
    point(claim.point,p+".point");
    claimById.set(heroId,claim.role as string);
  }
  const claimedShelves=new Set<string>();
  for(const [i,raw] of owners.entries()){
    const p="shopTraffic.shelfOwners["+i+"]";
    const owner=obj(raw,p,["shelfId","heroId"]);
    const shelfId=str(owner.shelfId,p+".shelfId");
    const heroId=str(owner.heroId,p+".heroId");
    unique(shelfId,claimedShelves,p+".shelfId");
    if(!shelfIds.has(shelfId))fail(p+".shelfId","has no such furniture shelf");
    if(claimById.get(heroId)!=="shelf-browse")
      fail(p+".heroId","requires the same hero's shelf-browse claim");
  }
  for(const [id,role] of claimById)
    if(role==="shelf-browse"&&!owners.some(v=>(v as {heroId:string}).heroId===id))
      fail("shopTraffic.shelfOwners","is missing a shelf-browse owner");
}
