import type { Point2 } from "./combatGeometry.ts";

/** All ranged effects use swept, wall-aware physical contact instead of
 * testing only their final position. Ordinary combat and boss projectiles
 * share the same collision authority. */
export interface CombatProjectileTarget extends Point2 {
  readonly id:string;
  readonly radius:number;
}
export interface CombatProjectileWall {
  readonly minX:number;readonly maxX:number;
  readonly minZ:number;readonly maxZ:number;
}
export interface CombatProjectileTrace {
  readonly end:Point2;
  readonly hitId:string|null;
  readonly blocked:boolean;
}

export function combatSegmentBox(
  a:Point2,b:Point2,box:CombatProjectileWall,padding=0,
):number|null {
  let near=0,far=1;
  for(const [axis,lo,hi] of [
    ["x",box.minX-padding,box.maxX+padding],
    ["z",box.minZ-padding,box.maxZ+padding],
  ] as const){
    const p=a[axis],delta=b[axis]-p;
    if(Math.abs(delta)<1e-9){
      if(p<lo||p>hi)return null;
    }else{
      const t1=(lo-p)/delta,t2=(hi-p)/delta;
      near=Math.max(near,Math.min(t1,t2));
      far=Math.min(far,Math.max(t1,t2));
      if(near>far)return null;
    }
  }
  return near;
}
export function combatSegmentCircle(
  a:Point2,b:Point2,center:Point2,radius:number,
):number|null {
  const dx=b.x-a.x,dz=b.z-a.z,ox=a.x-center.x,oz=a.z-center.z;
  const aa=dx*dx+dz*dz;
  if(aa<1e-12)return ox*ox+oz*oz<=radius*radius?0:null;
  const bb=2*(ox*dx+oz*dz),cc=ox*ox+oz*oz-radius*radius;
  if(cc<=0)return 0;
  const disc=bb*bb-4*aa*cc;
  if(disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);
  return t>=0&&t<=1?t:null;
}

/** A caller supplies only living hostile hitboxes. This makes team
 * protection explicit and stops an offscreen projectile killing allies.
 * Wall contact wins a simultaneous target impact, matching dungeon rules.
 */
export function traceCombatProjectile(
  start:Point2,delta:Point2,
  targets:readonly CombatProjectileTarget[],
  walls:readonly CombatProjectileWall[]=[],
):CombatProjectileTrace {
  const end={x:start.x+delta.x,z:start.z+delta.z};
  for(const n of [start.x,start.z,end.x,end.z]){
    if(!Number.isFinite(n))throw new RangeError("Projectile positions must be finite");
  }
  let wallT=Infinity;
  for(const wall of walls){
    const t=combatSegmentBox(start,end,wall);
    if(t!==null&&t<wallT)wallT=t;
  }
  let hitT=Infinity,hitId:string|null=null;
  for(const target of targets){
    if(!Number.isFinite(target.radius)||target.radius<=0)
      throw new RangeError("Invalid projectile target radius");
    const t=combatSegmentCircle(start,end,target,target.radius);
    if(t!==null&&(t<hitT-1e-8||
      (Math.abs(t-hitT)<=1e-8&&(hitId===null||target.id.localeCompare(hitId)<0)))){
      hitT=t;hitId=target.id;
    }
  }
  if(wallT<=hitT&&wallT<=1)return {end,hitId:null,blocked:true};
  if(hitId!==null&&hitT<=1)return {end,hitId,blocked:false};
  return {end,hitId:null,blocked:false};
}
