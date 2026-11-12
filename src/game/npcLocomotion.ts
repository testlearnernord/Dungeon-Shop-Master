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
