import { level5FloorWalkable, level5FloorSegmentWalkable } from "./level5Walkability.ts";
import type { Level5Room } from "./level5Room.ts";
import { COMPACT_COUNTER, getCounterPlacement, rotateShelfOffset, shelfBounds, type ShopLayout } from "./shopLayout.ts";

export interface ShopPoint { readonly x:number; readonly z:number }
export interface ShopperRoute {
  readonly waypoints: readonly ShopPoint[];
  readonly length: number;
}
const STEP=0.5;
const MIN=-6.5,MAX=6.5;
export function isObstructed(p:ShopPoint,layout:ShopLayout,room?:Level5Room):boolean{
  if(room)return !level5FloorWalkable(p,room,layout);
  const pad=0.36;
  // Furniture, counter and wall-adjacent space; entrance lanes z>6.5
  // are handled by the existing level-door route.
  if(Math.abs(p.x)>6.7||Math.abs(p.z)>6.7)return true;
  const counter=getCounterPlacement(layout);
  // Use the physical countertop plus walker clearance, not the wider
  // furniture-editing zone. The Level 4/6 central lane remains passable.
  const horizontal=counter.rotation%2===0?COMPACT_COUNTER.topWidth:COMPACT_COUNTER.topDepth;
  const vertical=counter.rotation%2===0?COMPACT_COUNTER.topDepth:COMPACT_COUNTER.topWidth;
  if(Math.abs(p.x-counter.x)<=horizontal/2+0.18&&
     Math.abs(p.z-counter.z)<=vertical/2+0.18)return true;
  for(const shelf of layout.shelves){
    const b=shelfBounds(shelf);
    if(p.x>b.minX-pad&&p.x<b.maxX+pad &&
       p.z>b.minZ-pad&&p.z<b.maxZ+pad)return true;
  }
  return false;
}
/** Sampling a whole segment (not just its endpoints) prevents off-grid
 * connectors from cutting diagonally through movable furniture.
 */
export function shopSegmentClear(a:ShopPoint,b:ShopPoint,layout:ShopLayout,room?:Level5Room):boolean {
  if(room)return level5FloorSegmentWalkable(a,b,room,layout);
  const distance=Math.hypot(b.x-a.x,b.z-a.z);
  if(!Number.isFinite(distance))return false;
  const samples=Math.max(1,Math.ceil(distance/0.1));
  for(let i=0;i<=samples;i++){
    const t=i/samples;
    if(isObstructed({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},layout))
      return false;
  }
  return true;
}
/** Fast, deterministic grid search with bounds and actual moved shelf footprints.
 * Routes never invent wall-crossing diagonals or mutate any GameState fields.
 */
export function pathToShopGoal(
  from:ShopPoint,to:ShopPoint,layout:ShopLayout,room?:Level5Room,
):ShopperRoute|null {
  if(!Number.isFinite(from.x)||!Number.isFinite(from.z)||
    !Number.isFinite(to.x)||!Number.isFinite(to.z))return null;
  // Excavation grows only sideways; don't multiply the grid's Z dimension
  // with every expansion tier when all those extra rows are solid rock.
  const minX=room?-6.5-2*room.expansionTier:MIN;
  const maxX=room?6.5+2*room.expansionTier:MAX;
  const minZ=MIN,maxZ=MAX;
  const width=Math.round((maxX-minX)/STEP)+1;
  const height=Math.round((maxZ-minZ)/STEP)+1;
  const point=(id:number):ShopPoint=>({
    x:minX+(id%width)*STEP,z:minZ+Math.floor(id/width)*STEP
  });
  const idx=(x:number,z:number)=>z*width+x;
  const inside=(x:number,z:number)=>x>=0&&z>=0&&x<width&&z<height;
  const blocked=(p:ShopPoint)=>isObstructed(p,layout,room);
  const clear=(a:ShopPoint,b:ShopPoint)=>shopSegmentClear(a,b,layout,room);
  const snap=(p:ShopPoint):number=>{
    let best=-1,bestDist=Infinity;
    const x0=Math.round((p.x-minX)/STEP);
    const z0=Math.round((p.z-minZ)/STEP);
    // Locate a legal nearby grid cell even when the destination is off-grid.
    for(let radius=0;radius<=3;radius++){
      for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
        const x=x0+dx,z=z0+dz;
        if(!inside(x,z)||blocked(point(idx(x,z))))continue;
        const candidate=idx(x,z);
        const p2=point(candidate);
        // For outside a shelf footprint, insist on a true straight connector.
        // Blocked destinations may use the nearest reachable standing point.
        if(!blocked(p)&&!clear(p,p2))continue;
        const d=(p2.x-p.x)**2+(p2.z-p.z)**2;
        if(d<bestDist){bestDist=d;best=candidate;}
      }
      if(best>=0)break;
    }
    return best;
  };
  const start=snap(from),goal=snap(to);
  if(start<0||goal<0)return null;
  const prev=new Int32Array(width*height).fill(-1);
  const queue=[start];prev[start]=start;
  const vectors=[[0,-1],[-1,0],[1,0],[0,1]] as const;
  for(let i=0;i<queue.length;i++){
    const cell=queue[i];
    if(cell===goal)break;
    const x=cell%width,z=Math.floor(cell/width);
    for(const [dx,dz] of vectors){
      const nx=x+dx,nz=z+dz;
      if(!inside(nx,nz))continue;
      const key=idx(nx,nz);
      if(prev[key]!==-1||blocked(point(key)))continue;
      prev[key]=cell;queue.push(key);
    }
  }
  if(prev[goal]===-1)return null;
  const path:number[]=[];
  let current=goal;
  while(current!==start){path.push(current);current=prev[current];}
  path.push(start);path.reverse();
  // Remove collinear intermediary grid points without cutting corners.
  const result:ShopPoint[]=[];
  const startingGrid=point(start);
  // The snapped-start connector must be part of the rendered route. Omitting it
  // makes the first turn a dangerous diagonal through a moved shelf.
  if(Math.hypot(from.x-startingGrid.x,from.z-startingGrid.z)>0.01)
    result.push(startingGrid);
  for(let i=1;i<path.length;i++){
    const p=point(path[i]);
    const before=point(path[i-1]);
    const after=path[i+1]===undefined?null:point(path[i+1]);
    if(after&&(p.x-before.x)*(after.z-p.z)===(p.z-before.z)*(after.x-p.x)){
      continue;
    }
    result.push(p);
  }
  // Append precise target only when it remains within collision-free space.
  // The snap grid cell is the guaranteed reachable fallback for odd angles.
  const last=result.at(-1)??(Math.hypot(from.x-startingGrid.x,
    from.z-startingGrid.z)<=0.01?from:startingGrid);
  if(!blocked(to)&&Math.hypot(last.x-to.x,last.z-to.z)>0.06){
    if(!clear(last,to))return null;
    result.push(to);
  }
  let cursor=from;
  for(const waypoint of result){
    if(!clear(cursor,waypoint))return null;
    cursor=waypoint;
  }
  return {waypoints:result,length:path.length-1};
}

/** Find a genuine reachable position at the FRONT of the requested shelf slot.
 * The nominal shelf point can become blocked after rearranging furniture; the
 * generic grid snap would otherwise silently place the customer behind a
 * collider (or claim they reached an inaccessible item). A small sidestep along
 * the same shelf face is acceptable, but a distant proxy is not.
 */
export function pathToShelfAccess(
  from:ShopPoint,layout:ShopLayout,shelfId:string,slotIndex:number,
  room?:Level5Room,
):ShopperRoute|null {
  const shelf=layout.shelves.find(entry=>entry.id===shelfId);
  if(!shelf||!Number.isSafeInteger(slotIndex)||slotIndex<0||slotIndex>=5)
    return null;
  for(const outward of [0,0.3,0.55]){
    for(const along of [0,-0.35,0.35,-0.7,0.7]){
      const offset=rotateShelfOffset(1.75+outward,slotIndex-2+along,shelf.rotation);
      const goal={x:shelf.x+offset.x,z:shelf.z+offset.z};
      if(isObstructed(goal,layout,room))continue;
      const route=pathToShopGoal(from,goal,layout,room);
      const reached=route?.waypoints.at(-1)??from;
      if(route&&Math.hypot(reached.x-goal.x,reached.z-goal.z)<=0.17)
        return route;
    }
  }
  return null;
}
