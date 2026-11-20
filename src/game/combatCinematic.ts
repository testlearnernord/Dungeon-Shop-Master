/** Deterministic cinematic sampler shared by the authored Cave Troll film and
 * opt-in group fight introductions. Only spectator-camera coordinates exist
 * here; this module never touches the fixed 60Hz combat/world simulation. */
export type CinematicVec3=readonly [number,number,number];
export interface CinematicKeyframe {
  readonly at:number;
  readonly eye:CinematicVec3;
  readonly look:CinematicVec3;
  readonly caption:string;
}
export interface CinematicFrame {
  readonly time:number;
  readonly eye:CinematicVec3;
  readonly look:CinematicVec3;
  readonly caption:string;
  readonly progress:number;
}
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const lerp=(a:CinematicVec3,b:CinematicVec3,t:number):CinematicVec3=>
  [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];

/** A smooth eye/look interpolation with stable captions, including terminal
 * time; keeps legacy Troll timing and positions exactly as authored. */
export function sampleCinematicTrack(
  keyframes:readonly CinematicKeyframe[],duration:number,seconds:number,
):CinematicFrame {
  if(keyframes.length<2||!Number.isFinite(duration)||duration<=0||
     keyframes[0].at!==0||
     keyframes[keyframes.length-1].at!==duration||
     keyframes.some((f,i)=>!Number.isFinite(f.at)||
       i>0&&f.at<=keyframes[i-1].at))
    throw new RangeError("Cinematic timeline requires sorted 0..duration keyframes");
  const time=clamp(Number.isFinite(seconds)?seconds:0,0,duration);
  let left=keyframes[0],right=keyframes[keyframes.length-1];
  for(let i=1;i<keyframes.length;i++)if(time<=keyframes[i].at){
    left=keyframes[i-1];right=keyframes[i];break;
  }
  const t=clamp((time-left.at)/(right.at-left.at),0,1);
  const eased=t*t*(3-2*t);
  return {
    time,eye:lerp(left.eye,right.eye,eased),
    look:lerp(left.look,right.look,eased),
    caption:left.caption,progress:time/duration,
  };
}
