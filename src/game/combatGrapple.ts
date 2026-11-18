import type { Point2 } from "./combatGeometry.ts";

/** Real grapple geometry shared by the historical Troll duel and the
 * multi-actor boss ability. The owner of an encounter still decides
 * who may grapple, when the contact window opens and whether they
 * have actually bought equipment; visuals never decide a catch. */
export const GRAPPLE_HOLD_OFFSET = 2.15;
export const GRAPPLE_THROW_DISTANCE = 7.5;
export const GRAPPLE_FLIGHT_SECONDS = 0.90;

export function grappleEscapeChance(agility:number):number {
  if(!Number.isFinite(agility)||agility<0||agility>1000)
    throw new RangeError("Invalid grapple agility");
  return Math.max(.035,Math.min(.20,.065+(agility-10)*.012));
}
export function grappleEscapes(agility:number,sample:number):boolean {
  if(!Number.isFinite(sample)||sample<0||sample>=1)
    throw new RangeError("Grapple break sample must be in [0,1)");
  return sample<grappleEscapeChance(agility);
}

/** Fixed distance in the attacker's *locked* attack direction, not
 * a position warp toward the victim while they are dodging. */
export function grappleHoldPosition(
  attacker:Point2,lockedHeading:number,
  distance=GRAPPLE_HOLD_OFFSET,
):Point2 {
  if(!Number.isFinite(lockedHeading)||!Number.isFinite(distance)||distance<0)
    throw new RangeError("Invalid grapple hold transform");
  return {
    x:attacker.x+Math.sin(lockedHeading)*distance,
    z:attacker.z+Math.cos(lockedHeading)*distance,
  };
}
export function grappleLaunchVelocity(
  attacker:Point2,target:Point2,
  distance=GRAPPLE_THROW_DISTANCE,flight=GRAPPLE_FLIGHT_SECONDS,
):Point2 {
  if(!Number.isFinite(distance)||distance<=0||
    !Number.isFinite(flight)||flight<=0||
    ![attacker.x,attacker.z,target.x,target.z].every(Number.isFinite))
    throw new RangeError("Invalid grapple launch parameters");
  const dx=target.x-attacker.x,dz=target.z-attacker.z;
  const length=Math.hypot(dx,dz);
  // Mirrors the existing Boss duel's deterministic +Z fallback.
  const direction=length>0.00001?
    {x:dx/length,z:dz/length}:{x:0,z:1};
  const speed=distance/flight;
  return {x:direction.x*speed,z:direction.z*speed};
}
