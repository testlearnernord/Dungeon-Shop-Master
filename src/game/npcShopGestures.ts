/** Pure presentation poses for the authoritative shopper lifecycle.
 * This is NOT a second customer state machine: requests, queue ownership,
 * pickups and payment are decided elsewhere. Only the visible limb targets
 * are calculated here, with no RNG, storage, timers or shop mutations.
 */
export type NpcShopGesture=
  "walking"|"idle"|"inspect"|"pickup"|"restock"|"credit"|
  "checkout"|"paid"|"conversation";

export type ConfirmedVisualAction="pickup"|"paid"|null;

export interface NpcShopGestureInput {
  readonly phase:string;
  readonly shoppingPhase:string;
  readonly moving:boolean;
  readonly time:number;
  readonly slot:number;
  readonly carrying:boolean;
  /** Set only after an actual successful pickup or completed payment. */
  readonly confirmedAction:ConfirmedVisualAction;
  readonly confirmedSeconds:number;
  readonly conversing:boolean;
}

export interface NpcShopPose {
  readonly gesture:NpcShopGesture;
  readonly leftArm:number;
  readonly rightArm:number;
  readonly headYaw:number;
  readonly headPitch:number;
  readonly headRoll:number;
  readonly torsoLean:number;
}

const neutral=(gesture:NpcShopGesture):NpcShopPose=>({
  gesture,leftArm:0,rightArm:0,headYaw:0,headPitch:0,
  headRoll:0,torsoLean:0,
});
const bounded=(n:number,min:number,max:number)=>
  Math.max(min,Math.min(max,Number.isFinite(n)?n:0));

/** Return a soft, human-scale pose, never a full-body teleport.
 * Reaching/nodding require confirmed shop events; waiting requests are
 * distinguishable from an ordinary shelf inspection.
 */
export function npcShopPose(input:NpcShopGestureInput):NpcShopPose {
  const t=bounded(input.time,0,1e8);
  const slot=bounded(input.slot,0,100);
  const breath=Math.sin(t*1.0+slot*.79);
  const glance=Math.sin(t*.72+slot*1.41);
  if(input.conversing)
    return {gesture:"conversation",leftArm:.18,rightArm:.26,
      headYaw:.025*glance,headPitch:.02,headRoll:.05*breath,
      torsoLean:.025};
  const event=input.confirmedAction;
  const remaining=bounded(input.confirmedSeconds,0,2);
  if(event&&remaining>0){
    const duration=event==="pickup"?1.15:.95;
    const progress=bounded(1-remaining/duration,0,1);
    const lift=Math.sin(Math.PI*progress);
    if(event==="pickup")
      return {gesture:"pickup",leftArm:.06*lift,
        rightArm:.88*lift,headYaw:.07*glance,
        headPitch:.14*lift,headRoll:0,torsoLean:.06*lift};
    return {gesture:"paid",leftArm:.42*lift,
      rightArm:input.carrying?.12*lift:.27*lift,
      headYaw:0,headPitch:.12*lift,headRoll:0,torsoLean:.015};
  }
  if(input.moving)return neutral("walking");
  if(input.phase==="considering"&&
     input.shoppingPhase==="considering-item"){
    const inspectPulse=(1+Math.sin(t*3.0+slot))*.5;
    return {gesture:"inspect",leftArm:.12,rightArm:.43+.25*inspectPulse,
      headYaw:.08*glance,headPitch:.17+.05*inspectPulse,
      headRoll:.035*breath,torsoLean:.045};
  }
  if(input.phase==="queueing"&&
     input.shoppingPhase==="awaiting-checkout"){
    return {gesture:"checkout",leftArm:.16+.03*breath,
      rightArm:input.carrying?.10:0,
      headYaw:.025*glance,headPitch:.025,
      headRoll:.01*breath,torsoLean:0};
  }
  const waitingRestock=[
    "waiting-for-restock","waiting-for-restock-overflow","roaming-request",
  ].includes(input.shoppingPhase);
  const waitingCredit=[
    "waiting-for-credit","waiting-for-credit-overflow",
  ].includes(input.shoppingPhase);
  if(input.phase==="queueing"&&waitingCredit){
    // Slight open-hand plea, not an endlessly looping cartoon wave.
    const ask=(1+Math.sin(t*1.3+slot*.8))*.5;
    return {gesture:"credit",leftArm:.21+.17*ask,
      rightArm:.18+.12*ask,headYaw:.10*glance,
      headPitch:-.045,headRoll:.045*breath,torsoLean:.025};
  }
  if(input.phase==="queueing"&&waitingRestock){
    const ask=(1+Math.sin(t*1.15+slot*.9))*.5;
    return {gesture:"restock",leftArm:.08,
      rightArm:.20+.32*ask,headYaw:.11*glance,
      headPitch:-.015,headRoll:.028*breath,torsoLean:0};
  }
  return {gesture:"idle",leftArm:0,rightArm:0,
    headYaw:.13*glance,headPitch:.025*breath,
    headRoll:.025*breath,torsoLean:0};
}
