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
export interface GhoulMotion {readonly clip:GhoulClip;readonly loop:boolean;readonly length:number;readonly start?:number;readonly end?:number}

/** Rendering choice only. Real hit windows/HP are recorded by groupCombat. */
export function ghoulMotionForPhase(
  phase:GroupPhase|"idle",strikeOrdinal=1,
):GhoulMotion {
  const claw=strikeOrdinal%2===0?"attack_claw_left":"attack_claw_right";
  switch(phase){
    case "move":return {clip:"walk_feral",loop:true,length:4.958};
    case "windup":return {clip:claw,loop:false,length:.62,start:0,end:.38};
    case "strike":return {clip:claw,loop:false,length:.33,start:.38,end:.76};
    case "recover":return {clip:claw,loop:false,length:.72,start:.76,end:1};
    case "hurt":case "thrown":return {clip:"hit_stagger",loop:false,length:.42};
    case "dead":return {clip:"death_fall",loop:false,length:3.958};
    case "roll":return {clip:"run_aggressive",loop:true,length:1.958};
    case "grab":return {clip:"attack_charge",loop:false,length:1.958};
    default:return {clip:"idle_combat",loop:true,length:1.958};
  }
}

export function ghoulClipProgress(time:number,motion:GhoulMotion):number {
  const elapsed=Number.isFinite(time)?Math.max(0,time):0;
  const progress=motion.loop?(elapsed/motion.length)%1:Math.min(1,elapsed/motion.length);
  const start=motion.start??0,end=motion.end??1;
  return start+(end-start)*progress;
}

/** Local phase time is derived from REAL committed transitions only,
 * never from video time. A 90-second idle must not scan 900 snapshots
 * for every on-screen Ghoul and every render frame. */
interface PhaseHistory {
  scanned:number;
  lastPhase:GroupPhase|null;
  starts:{at:number;phase:GroupPhase}[];
}
const phasesByFrames=new WeakMap<readonly GroupReplayFrame[],
  Map<string,PhaseHistory>>();
export function ghoulRecordedPhaseAge(
  frames:readonly GroupReplayFrame[],actorId:string,time:number,
):number {
  let byActor=phasesByFrames.get(frames);
  if(!byActor){byActor=new Map();phasesByFrames.set(frames,byActor);}
  let history=byActor.get(actorId);
  if(!history){
    history={scanned:0,lastPhase:null,starts:[]};
    byActor.set(actorId,history);
  }
  for(let i=history.scanned;i<frames.length;i++){
    const frame=frames[i];
    const actor=frame.actors.find(a=>a.id===actorId);
    if(!actor)continue;
    if(actor.phase!==history.lastPhase){
      history.starts.push({at:frame.t,phase:actor.phase});
      history.lastPhase=actor.phase;
    }
  }
  history.scanned=frames.length;
  // A binary search of actual transitions supports playback seeking and
  // long unchanging phases without depending on spectator FPS.
  let lo=0,hi=history.starts.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(history.starts[mid].at<=time+1e-6)lo=mid+1;
    else hi=mid;
  }
  return lo===0?0:Math.max(0,time-history.starts[lo-1].at);
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
