import type {GroupPhase,GroupReplayFrame} from "./groupCombat.ts";

/** 14 authored animation clips plus the separate combat idle, losslessly
 * consolidated by predev/prebuild. Source archives are never overwritten. */
export const GHOUL_MODEL="assets/models/dungeon-ghoul-tripo.glb";
export const GHOUL_CLIP_INDICES={
  attack_leap:1,hit_stagger:3,attack_claw_right:7,
  attack_claw_left:8,death_fall:9,run_aggressive:11,
  attack_charge:12,walk_feral:13,idle_combat:14,
} as const;
export type GhoulClip=keyof typeof GHOUL_CLIP_INDICES;
export interface GhoulMotion {readonly clip:GhoulClip;readonly loop:boolean;readonly length:number}

/** Rendering choice only. Real hit windows/HP are recorded by groupCombat. */
export function ghoulMotionForPhase(
  phase:GroupPhase,strikeOrdinal=1,
):GhoulMotion {
  switch(phase){
    case "move":return {clip:"walk_feral",loop:true,length:4.958};
    case "windup":return {clip:"attack_leap",loop:false,length:.85};
    case "strike":return {clip:strikeOrdinal%2===0
      ?"attack_claw_left":"attack_claw_right",loop:false,length:.38};
    case "hurt":case "thrown":return {clip:"hit_stagger",loop:false,length:.50};
    case "dead":return {clip:"death_fall",loop:false,length:3.958};
    case "roll":return {clip:"run_aggressive",loop:true,length:1.958};
    case "grab":return {clip:"attack_charge",loop:false,length:1.958};
    default:return {clip:"idle_combat",loop:true,length:1.958};
  }
}

export function ghoulClipProgress(time:number,motion:GhoulMotion):number {
  if(!Number.isFinite(time)||time<=0)return 0;
  return motion.loop?(time/motion.length)%1:Math.min(1,time/motion.length);
}

/** Local phase time is derived from committed combat frames, NOT the
 * player's elapsed video time. Seeking backwards gives the same pose. */
export function ghoulRecordedPhaseAge(
  frames:readonly GroupReplayFrame[],actorId:string,time:number,
):number {
  // Locate the visible checkpoint with binary search, rather than
  // skipping every *future* frame of a 90-second lab session every render.
  let lo=0,hi=frames.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(frames[mid].t<=time+1e-6)lo=mid+1;
    else hi=mid;
  }
  let from=time;
  let phase:string|undefined;
  for(let i=lo-1;i>=0;i--){
    const frame=frames[i];
    const actor=frame.actors.find(a=>a.id===actorId);
    if(!actor)continue;
    if(phase===undefined)phase=actor.phase;
    if(actor.phase!==phase)break;
    from=frame.t;
  }
  return Math.max(0,time-from);
}

/** A saved strike transition is one real attack, not one rendered sample.
 * Index clip variants from committed frames so replays/seeks remain stable
 * regardless of spectator FPS. No RNG, AI or combat time is consumed. */
interface RecordedStrikeIndex {
  readonly starts:number[];
  scanned:number;
  previous:GroupPhase|null;
}
const strikesByFrames=new WeakMap<readonly GroupReplayFrame[],
  Map<string,RecordedStrikeIndex>>();
export function ghoulRecordedStrikeOrdinal(
  frames:readonly GroupReplayFrame[],actorId:string,time:number,
):number {
  let all=strikesByFrames.get(frames);
  if(!all){all=new Map();strikesByFrames.set(frames,all);}
  let index=all.get(actorId);
  if(!index){
    index={starts:[],scanned:0,previous:null};
    all.set(actorId,index);
  }
  // An ongoing LIVE/Lab fight APPENDS new committed frames to the SAME array.
  // Keep the index current without re-scanning old strikes every refresh.
  for(let i=index.scanned;i<frames.length;i++){
    const frame=frames[i];
    const actor=frame.actors.find(a=>a.id===actorId);
    if(!actor)continue;
    if(actor.phase==="strike"&&index.previous!=="strike")
      index.starts.push(frame.t);
    index.previous=actor.phase;
  }
  index.scanned=frames.length;
  // Upper-bound search keeps rewind/replay seeking deterministic.
  let low=0,high=index.starts.length;
  while(low<high){
    const mid=(low+high)>>1;
    if(index.starts[mid]<=time+1e-6)low=mid+1;
    else high=mid;
  }
  return low;
}
