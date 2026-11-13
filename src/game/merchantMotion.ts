/** Deterministic first-person action curves. No Babylon dependency, so the
 * arm poses can be regression-tested without a browser or renderer. */
export type MerchantAction="stock"|"destock"|"mine"|"checkout";
export interface MerchantActionPose {
  readonly leftPitch:number;
  readonly rightPitch:number;
  readonly rightRoll:number;
  readonly toolVisible:boolean;
  readonly itemVisible:boolean;
  readonly coinVisible:boolean;
}
const clamp=(n:number)=>Math.min(1,Math.max(0,Number.isFinite(n)?n:0));

/** A single strike/transfer settles completely back to the neutral pose. */
export function merchantActionPose(action:MerchantAction|null,progress:number):MerchantActionPose {
  const t=clamp(progress);
  const swing=action===null?0:Math.sin(Math.PI*t);
  return {
    leftPitch:action==="stock"?-.58*swing:
      action==="destock"?.36*swing:action==="checkout"?-.36*swing:action==="mine"?.28*swing:0,
    rightPitch:action==="mine"?-1.28*swing:
      action==="stock"?-.92*swing:action==="destock"?.52*swing:
        action==="checkout"?-.5*swing:0,
    rightRoll:action==="mine"?-.43*swing:action==="checkout"?.17*swing:0,
    toolVisible:action==="mine"&&t<1,
    itemVisible:(action==="stock"&&t<.64)||(action==="destock"&&t>.32&&t<1),
    coinVisible:action==="checkout"&&t>.16&&t<.83,
  };
}
export interface MerchantGaitPose {
  readonly leftSwing:number;
  readonly rightSwing:number;
  readonly leftFootLift:number;
  readonly rightFootLift:number;
  readonly sway:number;
}
/** Distance-based (not frame-based) footsteps keep stride animation stable
 * across frame rates and camera inertia. */
export function merchantGaitPose(distance:number,isMoving:boolean):MerchantGaitPose {
  if(!isMoving||!Number.isFinite(distance)||distance<0)
    return {leftSwing:0,rightSwing:0,leftFootLift:0,rightFootLift:0,sway:0};
  const phase=distance*11;
  const stride=Math.sin(phase);
  return {
    leftSwing:stride*.36,rightSwing:-stride*.36,
    leftFootLift:Math.max(0,-stride)*.14,
    rightFootLift:Math.max(0,stride)*.14,
    sway:Math.sin(phase*.5)*.012,
  };
}
