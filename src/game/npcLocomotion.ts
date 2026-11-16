import type { ShopPoint } from "./shopperNavigation.ts";

export interface NpcLocomotion {
  readonly moving:boolean;
  /** Actual world-space meters per second, independent of state-machine labels. */
  readonly speed:number;
  /** Speed-relative progression for the walk cycle. */
  readonly strideScale:number;
}

/** The state machine describes intent, not whether legs should move.
 * An actor can walk while waiting in a queue, avoiding another NPC,
 * or navigating to an off-aisle space.
 */
export function npcLocomotion(
  before:ShopPoint,after:ShopPoint,elapsedSeconds:number,
  nominalWalkingSpeed=2.1,
):NpcLocomotion {
  if(!Number.isFinite(before.x)||!Number.isFinite(before.z)||
     !Number.isFinite(after.x)||!Number.isFinite(after.z)||
     !Number.isFinite(elapsedSeconds)||elapsedSeconds<=0||
     !Number.isFinite(nominalWalkingSpeed)||nominalWalkingSpeed<=0){
    return {moving:false,speed:0,strideScale:0};
  }
  const distance=Math.hypot(after.x-before.x,after.z-before.z);
  const speed=distance/elapsedSeconds;
  // Avoid jitter from floating-point drift; measured speed is normally ~2.1.
  if(speed<0.08)return {moving:false,speed:0,strideScale:0};
  return {moving:true,speed,
    strideScale:Math.max(0.4,Math.min(1.6,speed/nominalWalkingSpeed))};
}

/** Frame-rate independent walking envelope for cosmetic shop pedestrians.
 * Called only by the Babylon actor, never by the economy or path planner.
 * Retains a minimum walking pace near a reserved endpoint, so collision
 * checks and waypoint completion cannot stall just short of a station.
 */
export function easedNpcWalkSpeed(
  previous:number,distance:number,delta:number,
  finalWaypoint:boolean,maxSpeed=2.1,
):number{
  if(![previous,distance,delta,maxSpeed].every(Number.isFinite)||
     distance<0||delta<=0||maxSpeed<=0)return 0;
  const acceleration=4.6,braking=5.5;
  const stopDistance=Math.max(0,distance-0.16);
  const target=finalWaypoint
    ?Math.min(maxSpeed,Math.max(0.42,Math.sqrt(2*braking*stopDistance)))
    :maxSpeed;
  const speed=Math.max(0,Math.min(previous,maxSpeed));
  return speed<target
    ?Math.min(target,speed+acceleration*delta)
    :Math.max(target,speed-braking*delta);
}

/** Rotate via the shortest arc (including the +/- PI wrap) rather than
 * snapping an entire character 90-180 degrees in a single render frame.
 * Position still follows collision-authoritative movement, not facing.
 */
export function turnNpcToward(
  facing:number,target:number,delta:number,angularSpeed=8,
):number{
  if(![facing,target,delta,angularSpeed].every(Number.isFinite)||
     delta<=0||angularSpeed<=0)return Number.isFinite(facing)?facing:0;
  const diff=Math.atan2(Math.sin(target-facing),Math.cos(target-facing));
  return facing+Math.max(-angularSpeed*delta,
    Math.min(angularSpeed*delta,diff));
}
