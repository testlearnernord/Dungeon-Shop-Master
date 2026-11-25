import type {GroupReplayFrame} from "./groupCombat.ts";

/** Storage limit, never a simulation or outcome limit. Keep the latest
 * minute at 10Hz and retain the original first/last committed samples.
 * Only exceptionally long recordings have older positions thinned. */
export const MAX_COMBAT_FRAMES=2401;
const RECENT_FRAMES=600;
export function appendCombatFrame(frames:GroupReplayFrame[],frame:GroupReplayFrame):void{
  if(frames.length&&frame.t<=frames[frames.length-1].t)return;
  frames.push(frame);
  if(frames.length<=MAX_COMBAT_FRAMES)return;
  const split=frames.length-RECENT_FRAMES;
  const old=frames.slice(0,split).filter((_,i)=>i%2===0);
  frames.splice(0,split,...old);
}
/** Active checkpoints still prove exact full-rate coverage until the
 * first compaction, plus original and recent samples after compaction. */
export function combatFrameTimelineValid(raw:unknown[],completed:number):boolean{
  if(!Number.isSafeInteger(completed)||completed<0||completed%6!==0||
    raw.length<1||raw.length>MAX_COMBAT_FRAMES)return false;
  const count=1+completed/6;
  if(raw.length>count||count<=MAX_COMBAT_FRAMES&&raw.length!==count)return false;
  let previous=-1;
  for(let i=0;i<raw.length;i++){
    const t=(raw[i] as {t?:unknown}|null)?.t;
    if(typeof t!=="number"||!Number.isFinite(t)||t<=previous||
      Math.abs(t*10-Math.round(t*10))>1e-6)return false;
    if(i===0&&t!==0)return false;
    if(count<=MAX_COMBAT_FRAMES&&Math.abs(t-i/10)>1e-6)return false;
    if(count>MAX_COMBAT_FRAMES&&i>=raw.length-RECENT_FRAMES+1&&
      Math.abs(t-previous-.1)>1e-6)return false;
    previous=t;
  }
  return Math.abs(previous-completed/60)<1e-6;
}
