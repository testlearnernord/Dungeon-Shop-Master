/** Relative mouse deltas, not clicks or crosshair positioning, power the
 * first pond drill. This module is pure and independent from Babylon/UI. */
export const FISHING_FLICKS=[
  {x:-1,y:0,label:"LEFT",glyph:"←"},
  {x:1,y:0,label:"RIGHT",glyph:"→"},
  {x:0,y:-1,label:"UP",glyph:"↑"},
  {x:0,y:1,label:"DOWN",glyph:"↓"},
  {x:-1,y:-1,label:"UP LEFT",glyph:"↖"},
  {x:1,y:-1,label:"UP RIGHT",glyph:"↗"},
  {x:-1,y:1,label:"DOWN LEFT",glyph:"↙"},
  {x:1,y:1,label:"DOWN RIGHT",glyph:"↘"},
] as const;
export type FishingFlick=typeof FISHING_FLICKS[number];
export type FlickGrade="perfect"|"good"|"miss"|"too-small"|"too-slow";
export const REQUIRED_FLICKS=3,MAX_MISSES=3;
export const FLICK_WINDOW_MS=1750;
export const FLICK_SAMPLE_MS=240;
/** Screen-space +Y goes down. Diagonals are normalized in the dot product. */
export function scoreFishingFlick(
  dx:number,dy:number,sampleMs:number,target:{x:number;y:number},
):FlickGrade {
  if(![dx,dy,sampleMs,target.x,target.y].every(Number.isFinite)||
     sampleMs<0)return "miss";
  const length=Math.hypot(dx,dy);
  if(length<42)return "too-small";
  if(sampleMs>FLICK_SAMPLE_MS)return "too-slow";
  const magnitude=Math.hypot(target.x,target.y);
  if(!magnitude)return "miss";
  const dot=(dx*target.x+dy*target.y)/(length*magnitude);
  if(dot>=.95&&sampleMs<=170&&length>=56)return "perfect";
  return dot>=.83?"good":"miss";
}
export function fishingDirectionFor(catchCount:number,step:number):FishingFlick{
  const index=(Math.max(0,Math.floor(catchCount))*3+
    Math.max(0,Math.floor(step))*5+2)%FISHING_FLICKS.length;
  return FISHING_FLICKS[index];
}
