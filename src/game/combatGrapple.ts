import type { Point2 } from "./combatGeometry.ts";

/** Real grapple geometry shared by the historical Troll duel and the
 * multi-actor boss ability. The owner of an encounter still decides
 * who may grapple, when the contact window opens and whether they
 * have actually bought equipment; visuals never decide a catch. */
/** Shared authored timing; existing Cave Troll glTF animation contracts
 * still consume the same constants, not an improvised second timeline. */
export const GRAPPLE_TIMING = Object.freeze({
  windup: 1.20,
  trackUntil: 0.65,
  grabContact: 0.30,
  grab: 1.25,
  throwRelease: 0.58,
  throw: 1.55,
  flight: 0.90,
  missRecover: 0.62,
  recover: 0.85,
});
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

/** No global random consumption, and never sampled when a replay is viewed.
 * A deterministic per-contact roll supports multiple heroes in the same
 * world without making their array order affect the outcome. */
export function deterministicGrappleSample(
  attackerId:string,targetId:string,attackNumber:number,
):number {
  if(!attackerId||!targetId||!Number.isSafeInteger(attackNumber)||attackNumber<1)
    throw new RangeError("Invalid grapple roll identity");
  let hash=2166136261>>>0;
  for(const char of attackerId+"|"+targetId+"|"+attackNumber){
    hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  }
  return hash/0x100000000;
}
