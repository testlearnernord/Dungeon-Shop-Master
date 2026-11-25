import type {GroupCombatState,GroupCombatCue} from "./groupCombat.ts";

/** An inactivity window, not a battle duration limit. Every effective HP
 * change or measurable retreat advance starts a new window. */
export const COMBAT_STALL_SECONDS=30;
export interface CombatProgressCheckpoint {
  lastAt:number;
  bestExitDistance?:number;
}
export function observeCombatProgress(s:GroupCombatState,cues:readonly GroupCombatCue[]):boolean{
  const checkpoint=s.progress??(s.progress={lastAt:0});
  if(cues.some(c=>(c.amount??0)>0&&
      (c.kind==="hit"||c.kind==="heal"||c.kind==="landing"||c.kind==="lava")))
    checkpoint.lastAt=s.time;
  if(s.retreat){
    const distances=s.actors.filter(a=>a.team==="heroes"&&a.hp>0)
      .map(a=>Math.hypot(a.x-s.retreat!.x,a.z-s.retreat!.z));
    const distance=Math.max(0,...distances);
    if(checkpoint.bestExitDistance===undefined||distance<checkpoint.bestExitDistance-.25){
      checkpoint.bestExitDistance=distance;
      checkpoint.lastAt=s.time;
    }
  }
  return s.time-checkpoint.lastAt>=COMBAT_STALL_SECONDS;
}
export function validCombatProgress(raw:unknown,time:number):boolean{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
  const p=raw as Record<string,unknown>;
  const finite=(n:unknown,min:number,max:number)=>typeof n==="number"&&
    Number.isFinite(n)&&n>=min&&n<=max;
  return Object.keys(p).every(k=>k==="lastAt"||k==="bestExitDistance")&&
    finite(p.lastAt,0,time)&&
    (p.bestExitDistance===undefined||finite(p.bestExitDistance,0,100000));
}
