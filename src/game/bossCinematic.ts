/**
 * Level 6 encounter introduction. All camera coordinates are presentation only.
 * The saved encounter's first frame stays untouched until the music hits 13.5s.
 * One hero currently fights this boss: do not conjure a fake party for the film.
 */
export const BOSS_INTRO_SECONDS=13.5;

type Vec3=readonly [number,number,number];
interface Keyframe {
  readonly at:number;
  readonly eye:Vec3;
  readonly look:Vec3;
  readonly caption:string;
}
const FRAMES:readonly Keyframe[]=[
  {at:0,eye:[-14.5,7.8,-16],look:[0,3.8,0],caption:"FLOOR VI · THE ASHEN TUNNEL"},
  {at:3.2,eye:[-7.4,6.5,-9.4],look:[0,5.5,2],caption:"SOMETHING STIRS IN THE DARK"},
  {at:5.7,eye:[-4.4,4.8,-5.4],look:[0,5.3,2],caption:"THE TUNNEL MAULER"},
  {at:8.6,eye:[2.5,3.6,-15.5],look:[0,2.1,-9],caption:"ONE HERO. NO WAY BACK."},
  {at:11.6,eye:[4.7,5.7,-6.5],look:[0,5.3,2],caption:"A DEBT PAID IN BLOOD"},
  {at:BOSS_INTRO_SECONDS,eye:[4,5,-17],look:[0,3,-3],caption:"FIGHT"},
];
const clamp=(n:number,lower:number,upper:number)=>Math.max(lower,Math.min(upper,n));
const smooth=(t:number)=>t*t*(3-2*t);
function mix(a:Vec3,b:Vec3,t:number):Vec3{
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
export interface BossIntroFrame {
  readonly time:number;
  readonly eye:Vec3;
  readonly look:Vec3;
  readonly caption:string;
  readonly progress:number;
}

/** Pure timeline sampled at the *music* time when available, never combat time. */
export function sampleBossIntro(seconds:number):BossIntroFrame {
  const time=clamp(Number.isFinite(seconds)?seconds:0,0,BOSS_INTRO_SECONDS);
  let left=FRAMES[0]!,right=FRAMES[FRAMES.length-1]!;
  for(let i=1;i<FRAMES.length;i++){
    if(time<=FRAMES[i]!.at){left=FRAMES[i-1]!;right=FRAMES[i]!;break;}
  }
  const width=right.at-left.at;
  const progress=width>0?smooth(clamp((time-left.at)/width,0,1)):1;
  return {
    time,eye:mix(left.eye,right.eye,progress),
    look:mix(left.look,right.look,progress),
    caption:left.caption,
    progress:time/BOSS_INTRO_SECONDS,
  };
}
