import type { Point2 } from "./combatGeometry.ts";
import {combatSegmentBox,type CombatProjectileWall} from "./combatProjectile.ts";

export interface CombatMotionResult extends Point2 {
  /** Distance actually moved after collision and boundary resolution. */
  readonly distance: number;
  /** Whether the unbounded requested destination crossed a circle boundary. */
  readonly crossedBoundary: boolean;
}

export type CombatMovementConstraint =
  | { readonly kind:"circle"; readonly radius:number }
  | { readonly kind:"walkable"; readonly canOccupy:(candidate:Point2)=>boolean };

function validPoint(p:Point2):boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z);
}

/**
 * Single geometry integrator for arena combat movement. It accepts a displacement
 * in game-space metres, never mutates its inputs and never advances simulation
 * time. Group fights supply their bounds/actor/obstacle collision predicate;
 * bosses supply the circular cavern radius. Same accepted-position and
 * distance accounting for all combatants, including slides along walls.
 */
export function moveCombatant(
  position:Point2, delta:Point2, constraint:CombatMovementConstraint,
):CombatMotionResult {
  if(!validPoint(position) || !validPoint(delta))
    throw new RangeError("Combat movement requires finite coordinates");
  const requested={x:position.x+delta.x,z:position.z+delta.z};
  let result:Point2;
  let crossedBoundary=false;
  if(constraint.kind==="circle"){
    const radius=constraint.radius;
    if(!Number.isFinite(radius)||radius<=0 || radius>10000)
      throw new RangeError("Invalid circular combat boundary");
    const distanceFromCenter=Math.hypot(requested.x,requested.z);
    crossedBoundary=distanceFromCenter>radius;
    const factor=crossedBoundary?radius/distanceFromCenter:1;
    result={x:requested.x*factor,z:requested.z*factor};
  }else{
    // Keep legacy collision sliding semantics: try full step, then X and Z
    // separately. An enemy can block a passage without becoming intangible.
    const can=constraint.canOccupy;
    if(can(requested))result=requested;
    else{
      const x=can({x:requested.x,z:position.z})?requested.x:position.x;
      const z=can({x,z:requested.z})?requested.z:position.z;
      result={x,z};
    }
  }
  return {...result,
    distance:Math.hypot(result.x-position.x,result.z-position.z),
    crossedBoundary};
}

/** Do not duplicate slightly different unit-direction and facing maths in
 * each encounter type. A zero-length direction uses deterministic north. */
export function combatDirection(from:Point2,to:Point2):Point2 {
  const dx=to.x-from.x,dz=to.z-from.z;
  const distance=Math.hypot(dx,dz);
  return distance>0.000001?{x:dx/distance,z:dz/distance}:{x:0,z:1};
}
export function combatHeading(from:Point2,to:Point2):number {
  return Math.atan2(to.x-from.x,to.z-from.z);
}


type CombatRouteGraph={points:Point2[];edges:number[][]};
const routeGraphs=new WeakMap<readonly CombatProjectileWall[],Map<string,CombatRouteGraph>>();
const gap=(a:Point2,b:Point2)=>Math.hypot(a.x-b.x,a.z-b.z);
function clearRoute(a:Point2,b:Point2,walls:readonly CombatProjectileWall[],radius:number):boolean{
  return !walls.some(wall=>combatSegmentBox(a,b,wall,Math.max(0,radius-1e-6))!==null);
}
function routePosition(p:Point2,bounds:CombatProjectileWall,walls:readonly CombatProjectileWall[],radius:number):boolean{
  return p.x>=bounds.minX+radius&&p.x<=bounds.maxX-radius&&
    p.z>=bounds.minZ+radius&&p.z<=bounds.maxZ-radius&&
    !walls.some(w=>p.x>w.minX-radius&&p.x<w.maxX+radius&&
      p.z>w.minZ-radius&&p.z<w.maxZ+radius);
}
function routeGraph(bounds:CombatProjectileWall,walls:readonly CombatProjectileWall[],radius:number):CombatRouteGraph{
  let byRadius=routeGraphs.get(walls);
  if(!byRadius){byRadius=new Map();routeGraphs.set(walls,byRadius);}
  const key=[radius,bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].join(":");
  const cached=byRadius.get(key);if(cached)return cached;
  const points:Point2[]=[];
  const margin=radius+.025;
  for(const w of walls)for(const x of [w.minX-margin,w.maxX+margin])
    for(const z of [w.minZ-margin,w.maxZ+margin]){
      const p={x,z};
      if(routePosition(p,bounds,walls,radius)&&!points.some(q=>gap(p,q)<1e-6))points.push(p);
    }
  const edges=points.map((p,i)=>points.map((q,j)=>i!==j&&clearRoute(p,q,walls,radius)?gap(p,q):Infinity));
  const graph={points,edges};byRadius.set(key,graph);return graph;
}

/** A collision-sized, deterministic approach to a visible attack position.
 * Static obstacle corners form a reusable visibility graph; actual actor
 * collisions and every 60-Hz displacement still belong to moveCombatant.
 * No time, random state, saved route or second combat authority is created.
 * An unreachable target returns null rather than walking through stone. */
export function combatApproachWaypoint(position:Point2,target:Point2,
  bounds:CombatProjectileWall,walls:readonly CombatProjectileWall[],
  radius:number,attackDistance:number):Point2|null{
  const goal=(from:Point2):Point2|null=>{
    const d=gap(from,target);
    const travel=Math.max(0,d-Math.max(.01,attackDistance-.05));
    const p=d>1e-8?{x:from.x+(target.x-from.x)*travel/d,z:from.z+(target.z-from.z)*travel/d}:from;
    return routePosition(p,bounds,walls,radius)&&clearRoute(from,p,walls,radius)&&
      clearRoute(p,target,walls,0)?p:null;
  };
  const direct=goal(position);
  if(direct)return direct;
  const {points,edges}=routeGraph(bounds,walls,radius);
  const costs=points.map(p=>clearRoute(position,p,walls,radius)?gap(position,p):Infinity);
  const first=points.map((_,i)=>i),used=points.map(()=>false);
  let best=Infinity,waypoint:Point2|null=null;
  for(let k=0;k<points.length;k++){
    let i=-1;
    for(let j=0;j<points.length;j++)if(!used[j]&&(i<0||costs[j]<costs[i]))i=j;
    if(i<0||!Number.isFinite(costs[i])||costs[i]>=best)break;
    used[i]=true;
    const end=goal(points[i]);
    if(end&&costs[i]+gap(points[i],end)<best){
      best=costs[i]+gap(points[i],end);
      waypoint=gap(position,points[first[i]])>1e-6?points[first[i]]:end;
    }
    for(let j=0;j<points.length;j++){
      const cost=costs[i]+edges[i][j];
      if(!used[j]&&cost<costs[j]-1e-8){
        costs[j]=cost;first[j]=gap(position,points[first[i]])>1e-6?first[i]:j;
      }
    }
  }
  return waypoint;
}
