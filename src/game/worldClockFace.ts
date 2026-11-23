import {firstWorldTickOfDay,WORLD_TICKS_PER_DAY} from "./worldClock.ts";

/** Read-only projection of the saved authoritative world tick.
 * No animation timer, day closure, state mutation or second clock owner. */
export interface WorldClockFace {
  readonly fraction:number;
  readonly angleRadians:number;
  readonly hour:number;
  readonly minute:number;
  readonly stopped:boolean;
  readonly label:string;
}
export function worldClockFace(day:number,tick:number):WorldClockFace {
  const first=firstWorldTickOfDay(day);
  const last=first+WORLD_TICKS_PER_DAY-1;
  if(!Number.isSafeInteger(tick)||tick<first||tick>last)
    throw new RangeError("World clock face requires an in-day committed tick.");
  const elapsed=tick-first;
  const stopped=elapsed===WORLD_TICKS_PER_DAY-1;
  const fraction=stopped?1:elapsed/WORLD_TICKS_PER_DAY;
  const totalMinutes=Math.floor(elapsed/20);
  const hour=stopped?24:Math.floor(totalMinutes/60);
  const minute=stopped?0:totalMinutes%60;
  const label=String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");
  // The clock is mounted with a 180° Y rotation on the rear shop wall.
  // A positive *local* Z rotation is therefore clockwise when observed
  // from Galvik's side of the wall: 06:00 points right, 18:00 left.
  return {fraction,angleRadians:2*Math.PI*fraction,hour,minute,stopped,label};
}
