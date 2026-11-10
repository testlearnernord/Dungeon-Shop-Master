import { checkoutCounterBounds, shelfBounds, type ShopLayout } from "./shopLayout.ts";

export interface ShopPoint { readonly x:number; readonly z:number }
export interface ShopperRoute {
  readonly waypoints: readonly ShopPoint[];
  readonly length: number;
}
const STEP=0.5;
const MIN=-6.5,MAX=6.5,COUNT=Math.round((MAX-MIN)/STEP)+1;
const worldPoint=(index:number):ShopPoint=>({
  x:MIN+(index%COUNT)*STEP,
  z:MIN+Math.floor(index/COUNT)*STEP,
});
const index=(x:number,z:number)=>z*COUNT+x;
const inGrid=(x:number,z:number)=>x>=0&&z>=0&&x<COUNT&&z<COUNT;
export function isObstructed(p:ShopPoint,layout:ShopLayout):boolean{
  const pad=0.36;
  // Furniture, counter and wall-adjacent space; entrance lanes z>6.5
  // are handled by the existing level-door route.
  if(Math.abs(p.x)>6.7||Math.abs(p.z)>6.7)return true;
  const counter=checkoutCounterBounds();
  if(p.x>=counter.minX+0.1&&p.x<=counter.maxX-0.1&&
     p.z>=counter.minZ+0.35&&p.z<=counter.maxZ-0.15)return true;
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
export function shopSegmentClear(a:ShopPoint,b:ShopPoint,layout:ShopLayout):boolean {
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
  from:ShopPoint,to:ShopPoint,layout:ShopLayout,
):ShopperRoute|null {
  if(!Number.isFinite(from.x)||!Number.isFinite(from.z)||
    !Number.isFinite(to.x)||!Number.isFinite(to.z))return null;
  const snap=(p:ShopPoint):number=>{
    let best=-1,bestDist=Infinity;
    const x0=Math.round((p.x-MIN)/STEP);
    const z0=Math.round((p.z-MIN)/STEP);
    // Locate a legal nearby grid cell even when the destination is off-grid.
    for(let radius=0;radius<=3;radius++){
      for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
        const x=x0+dx,z=z0+dz;
        if(!inGrid(x,z)||isObstructed(worldPoint(index(x,z)),layout))continue;
        const candidate=index(x,z);
        const p2=worldPoint(candidate);
        // For outside a shelf footprint, insist on a true straight connector.
        // Blocked destinations may use the nearest reachable standing point.
        if(!isObstructed(p,layout)&&!shopSegmentClear(p,p2,layout))continue;
        const d=(p2.x-p.x)**2+(p2.z-p.z)**2;
        if(d<bestDist){bestDist=d;best=candidate;}
      }
      if(best>=0)break;
    }
    return best;
  };
  const start=snap(from),goal=snap(to);
  if(start<0||goal<0)return null;
  const prev=new Int32Array(COUNT*COUNT).fill(-1);
  const queue=[start];prev[start]=start;
  const vectors=[[0,-1],[-1,0],[1,0],[0,1]] as const;
  for(let i=0;i<queue.length;i++){
    const cell=queue[i];
    if(cell===goal)break;
    const x=cell%COUNT,z=Math.floor(cell/COUNT);
    for(const [dx,dz] of vectors){
      const nx=x+dx,nz=z+dz;
      if(!inGrid(nx,nz))continue;
      const key=index(nx,nz);
      if(prev[key]!==-1||isObstructed(worldPoint(key),layout))continue;
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
  const startingGrid=worldPoint(start);
  // The snapped-start connector must be part of the rendered route. Omitting it
  // makes the first turn a dangerous diagonal through a moved shelf.
  if(Math.hypot(from.x-startingGrid.x,from.z-startingGrid.z)>0.01)
    result.push(startingGrid);
  for(let i=1;i<path.length;i++){
    const p=worldPoint(path[i]);
    const before=worldPoint(path[i-1]);
    const after=path[i+1]===undefined?null:worldPoint(path[i+1]);
    if(after&&(p.x-before.x)*(after.z-p.z)===(p.z-before.z)*(after.x-p.x)){
      continue;
    }
    result.push(p);
  }
  // Append precise target only when it remains within collision-free space.
  // The snap grid cell is the guaranteed reachable fallback for odd angles.
  const last=result.at(-1)??(Math.hypot(from.x-startingGrid.x,
    from.z-startingGrid.z)<=0.01?from:startingGrid);
  if(!isObstructed(to,layout)&&Math.hypot(last.x-to.x,last.z-to.z)>0.06){
    if(!shopSegmentClear(last,to,layout))return null;
    result.push(to);
  }
  let cursor=from;
  for(const waypoint of result){
    if(!shopSegmentClear(cursor,waypoint,layout))return null;
    cursor=waypoint;
  }
  return {waypoints:result,length:path.length-1};
}
