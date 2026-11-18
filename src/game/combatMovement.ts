import type { Point2 } from "./combatGeometry.ts";

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
