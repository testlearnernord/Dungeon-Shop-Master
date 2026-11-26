import type {GameState} from "./gameState.ts";
import {CELLAR_ENTRY_X,CELLAR_FLOOR_Y,CELLAR_FORGE_CLEARANCE,isCellarFloor} from "./cellarRoom.ts";
import {POND_CENTER,POND_WIDTH,POND_LENGTH,isCellarPondUncovered} from "./cellarPond.ts";
import {furnitureTouchesActor,pointTouchesShopBounds} from "./furnitureRegistry.ts";
import {shopFloorWalkable} from "./shopWalkability.ts";
import {createConnectedRoutePlanner,type ShopPoint} from "./shopperNavigation.ts";

/** Private rooms use the same grid search as customers, with their real
 * geometry. The stair surface is the same eight-metre ramp as the FPS. */
export const EMPLOYEE_RADIUS=.30;
export const EMPLOYEE_HOME:ShopPoint={x:0,z:-24};
export const employeeFloorY=(z:number):number=>
  CELLAR_FLOOR_Y*Math.max(0,Math.min(1,(-12.1-z)/8));
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
export function employeeRoute(state:GameState,from:ShopPoint,to:ShopPoint){
  if(!employeeWalkable(state,from)||!employeeWalkable(state,to))return null;
  if(employeeSegmentClear(state,from,to))return {waypoints:[to],length:Math.hypot(to.x-from.x,to.z-from.z)};
  const extent=6.5+2*Math.max(state.shopRoom.expansionTier,state.cellarRoom.expansionTier);
  return createConnectedRoutePlanner({minX:-extent,maxX:extent,minZ:-33.5,maxZ:6.5},
    p=>!employeeWalkable(state,p),(a,b)=>employeeSegmentClear(state,a,b),true)(from,to);
}
