import type {GameState} from "./gameState.ts";
import {CELLAR_ENTRY_X,CELLAR_FLOOR_Y,CELLAR_FORGE_CLEARANCE,isCellarFloor} from "./cellarRoom.ts";
import {POND_CENTER,POND_WIDTH,POND_LENGTH,isCellarPondUncovered} from "./cellarPond.ts";
import {furnitureTouchesActor,pointTouchesShopBounds,turnShopOffset} from "./furnitureRegistry.ts";
import {counterDockPoint} from "./shopLayout.ts";
import {shopFloorWalkable} from "./shopWalkability.ts";
import {createConnectedRoutePlanner,shopPointSegmentDistance,type ShopPoint} from "./shopperNavigation.ts";

/** Private rooms use the same grid search as customers, with their real
 * geometry. The stair surface is the same eight-metre ramp as the FPS. */
export const EMPLOYEE_RADIUS=.30;
export const EMPLOYEE_HOME:ShopPoint={x:0,z:-24};
export const employeeFloorY=(z:number):number=>
  z>=-12.1?0:CELLAR_FLOOR_Y*Math.min(1,(-12.1-z)/8);
export function employeeWalkable(state:GameState,p:ShopPoint):boolean{
  const {x,z}=p,r=EMPLOYEE_RADIUS;
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(z>=-6.5)return shopFloorWalkable(p,state.shopRoom,state.shopLayout,r);
  if(z>=-7.7)return Math.abs(x)<=.76&&
    !state.bedroomFurniture.some(f=>furnitureTouchesActor(f,{...p,radius:r}));
  if(z>=-11.7)return Math.abs(x)<=2.5&&
    !state.bedroomFurniture.some(f=>furnitureTouchesActor(f,{...p,radius:r}));
  if(z>=-20.1){
    if(Math.abs(x-CELLAR_ENTRY_X)>.60)return false;
    if(!state.cellarDoorOpen&&Math.abs(z+12.35)<.43)return false;
    return z<-12.1||!state.bedroomFurniture.some(f=>furnitureTouchesActor(f,{...p,radius:r}));
  }
  for(const dx of [-r,r])for(const dz of [-r,r])
    if(!isCellarFloor(state.cellarRoom,x+dx,z+dz))return false;
  if(pointTouchesShopBounds(CELLAR_FORGE_CLEARANCE,p,r)||
     furnitureTouchesActor(state.cellarChest,{...p,radius:r})||
     furnitureTouchesActor(state.cellarTable,{...p,radius:r}))return false;
  if(isCellarPondUncovered(state.cellarRoom)&&
    Math.abs(x-POND_CENTER.x)<POND_WIDTH/2+r&&
    Math.abs(z-POND_CENTER.z)<POND_LENGTH/2+r)return false;
  // The front masonry only admits the stair mouth.
  if(z>-20.45&&Math.abs(x-CELLAR_ENTRY_X)>.60)return false;
  return true;
}
export function employeeSegmentClear(state:GameState,a:ShopPoint,b:ShopPoint):boolean{
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    if(!employeeWalkable(state,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;
  }
  return true;
}
export function employeeHome(state:GameState):ShopPoint|null{
  const candidates=[EMPLOYEE_HOME,{x:-1,z:-24},{x:1,z:-24},
    {x:-2,z:-23},{x:2,z:-23},{x:-1,z:-22},{x:1,z:-22}];
  return candidates.find(p=>employeeWalkable(state,p))??null;
}
/** A worker with enabled tasks waits near the actual counter instead of
 * making a cellar round trip between customers. The closed portrait remains
 * a real physical barrier; no remote work or teleport is introduced. */
export function employeeStandby(state:GameState,from:ShopPoint):ShopPoint|null{
  if(!state.cellarDoorOpen&&from.z<-12.1)return employeeHome(state);
  const dock=counterDockPoint(state.shopLayout,"staff");
  const customer=counterDockPoint(state.shopLayout,"customer");
  const dx=dock.x-customer.x,dz=dock.z-customer.z;
  const length=Math.hypot(dx,dz)||1;
  const points=[-1,1].map(side=>({
    x:dock.x-side*dz/length*.9,z:dock.z+side*dx/length*.9,
  }));
  points.push(dock);
  return points.find(p=>employeeWalkable(state,p)&&
    state.shopTraffic.actors.every(a=>Math.hypot(a.x-p.x,a.z-p.z)>=EMPLOYEE_CUSTOMER_CLEARANCE))
    ??(from.z>=-6.5&&employeeWalkable(state,from)?{x:from.x,z:from.z}:employeeHome(state));
}
/** The existing movable cellar chest is the employee pickup/return dock. */
export function employeeStoragePoint(state:GameState):ShopPoint|null{
  const chest=state.cellarChest;
  const offsets=[{x:0,z:.95},{x:.95,z:0},{x:-.95,z:0},{x:0,z:-.95}];
  return offsets.map(p=>{
    const d=turnShopOffset(p.x,p.z,chest.rotation);
    return {x:chest.x+d.x,z:chest.z+d.z};
  }).find(p=>employeeWalkable(state,p))??null;
}
export const EMPLOYEE_CUSTOMER_CLEARANCE=.68;
/** An overlap may be escaped, never deepened. Keep the same clearance for
 * planning and committed movement; an overlapped customer remains an obstacle
 * after the first escape segment. */
export function employeeCustomerSegmentClear(state:GameState,a:ShopPoint,b:ShopPoint):boolean{
  return state.shopTraffic.actors.every(other=>{
    const distance=Math.hypot(a.x-other.x,a.z-other.z);
    if(distance<EMPLOYEE_CUSTOMER_CLEARANCE){
      const dot=(a.x-other.x)*(b.x-a.x)+(a.z-other.z)*(b.z-a.z);
      return dot>=-1e-10;
    }
    return shopPointSegmentDistance(other,a,b)>=EMPLOYEE_CUSTOMER_CLEARANCE-1e-10;
  });
}
export function employeeRoute(state:GameState,from:ShopPoint,to:ShopPoint,avoidCustomers=false){
  if(!employeeWalkable(state,from)||!employeeWalkable(state,to))return null;
  const obstacles=avoidCustomers?state.shopTraffic.actors:[];
  const occupied=(p:ShopPoint)=>obstacles.some(a=>Math.hypot(a.x-p.x,a.z-p.z)<EMPLOYEE_CUSTOMER_CLEARANCE);
  const blocked=(p:ShopPoint)=>!employeeWalkable(state,p)||occupied(p);
  const clear=(a:ShopPoint,b:ShopPoint)=>employeeSegmentClear(state,a,b)&&
    obstacles.every(other=>shopPointSegmentDistance(other,a,b)>=EMPLOYEE_CUSTOMER_CLEARANCE-1e-10);
  if(blocked(to))return null;
  if(clear(from,to))return {waypoints:[to],length:Math.hypot(to.x-from.x,to.z-from.z)};
  const extent=6.5+2*Math.max(state.shopRoom.expansionTier,state.cellarRoom.expansionTier);
  const plan=createConnectedRoutePlanner({minX:-extent,maxX:extent,minZ:-33.5,maxZ:6.5},
    blocked,clear,true);
  if(!occupied(from))return plan(from,to);
  // A shopper can walk close while the worker is moving. Find a genuine
  // sidestep that increases separation from every overlapping customer,
  // then resume the usual connected planner with ALL customers as obstacles.
  // This is a physical waypoint, not a teleport or a collision exemption.
  const heading=Math.atan2(to.z-from.z,to.x-from.x);
  // Target-relative 22.5-degree spokes alone miss narrow escape cones
  // between two queued customers (including the recorded second smoke).
  // Include world axes and the exact tangents of nearby clearance circles,
  // then bisect the resulting angular intervals. The same segment guard
  // still decides whether each candidate is physically legal.
  const normalize=(angle:number)=>(angle%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  const angles=[heading,0,Math.PI/2,Math.PI,3*Math.PI/2];
  for(let i=0;i<16;i++)angles.push(heading+i*Math.PI/8);
  for(const other of obstacles){
    const dx=from.x-other.x,dz=from.z-other.z,d=Math.hypot(dx,dz);
    if(d>EMPLOYEE_CUSTOMER_CLEARANCE+1.5||d<1e-10)continue;
    const outward=Math.atan2(dz,dx);
    angles.push(outward,outward+Math.PI/2,outward-Math.PI/2);
    if(d>=EMPLOYEE_CUSTOMER_CLEARANCE){
      const offset=Math.asin(EMPLOYEE_CUSTOMER_CLEARANCE/d);
      angles.push(outward+Math.PI+offset,outward+Math.PI-offset);
    }
  }
  const boundaries=[...new Set(angles.map(normalize))].sort((a,b)=>a-b);
  const directions=[...boundaries,...boundaries.map((a,i)=>
    normalize((a+(boundaries[i+1]??boundaries[0]+2*Math.PI))/2))];
  const candidates:ShopPoint[]=[];
  for(const length of [.15,.25,.5,.8,1.15,1.5])for(const angle of directions){
    const p={x:from.x+Math.cos(angle)*length,z:from.z+Math.sin(angle)*length};
    if(!blocked(p)&&employeeSegmentClear(state,from,p)&&employeeCustomerSegmentClear(state,from,p))
      candidates.push(p);
  }
  for(const p of candidates){
    const route=clear(p,to)?{waypoints:[to],length:Math.hypot(to.x-p.x,to.z-p.z)}:plan(p,to);
    if(route)return {waypoints:[p,...route.waypoints],length:Math.hypot(p.x-from.x,p.z-from.z)+route.length};
  }
  return null;
}


/** Static access is independent of temporary customer occupancy. Cache only
 * immutable furniture/room topology and the real cellar door; never cache
 * worker positions, cargo, or a customer-blocked route as unreachable. */
type RestockAccessCache={
  room:GameState["shopRoom"];cellar:GameState["cellarRoom"];
  bedroom:GameState["bedroomFurniture"];chest:GameState["cellarChest"];
  table:GameState["cellarTable"];door:boolean;targets:Map<string,boolean>;
};
const restockAccessCache=new WeakMap<GameState["shopLayout"],RestockAccessCache>();
export function employeeRestockAccessible(state:GameState,target:ShopPoint):boolean{
  // Every shelf belongs to the public shop, every collection dock to the
  // cellar. A shut portrait disconnects the two even if the worker is upstairs.
  if(!state.cellarDoorOpen)return false;
  let cache=restockAccessCache.get(state.shopLayout);
  if(!cache||cache.room!==state.shopRoom||cache.cellar!==state.cellarRoom||
    cache.bedroom!==state.bedroomFurniture||cache.chest!==state.cellarChest||
    cache.table!==state.cellarTable||cache.door!==state.cellarDoorOpen){
    cache={room:state.shopRoom,cellar:state.cellarRoom,bedroom:state.bedroomFurniture,
      chest:state.cellarChest,table:state.cellarTable,door:state.cellarDoorOpen,targets:new Map()};
    restockAccessCache.set(state.shopLayout,cache);
  }
  const key=target.x+":"+target.z;
  const previous=cache.targets.get(key);
  if(previous!==undefined)return previous;
  const dock=employeeStoragePoint(state);
  const reachable=!!dock&&!!employeeRoute(state,dock,target);
  cache.targets.set(key,reachable);
  return reachable;
}
