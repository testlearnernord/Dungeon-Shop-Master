/** Presentation adapter only. Browser elapsed time is never a gameplay event. */
export const REAL_MS_PER_WORLD_TICK=1000; // provisional until gameplay balance pass
export const MAX_WORLD_TICKS_PER_FRAME=8;
const MAX_BUFFERED_REAL_MS=10000;

export class WorldClockPacer {
  private carriedMs=0;
  private readonly pauseReasons=new Set<string>();

  setPaused(reason:string,paused:boolean):void {
    if(!reason)throw new RangeError("Pause reason is required.");
    if(paused)this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    if(paused)this.reset();
  }
  get isPaused():boolean{return this.pauseReasons.size>0;}
  reset():void{this.carriedMs=0;}

  /** Bounded catch-up after foreground render stalls, zero catch-up on pause.
   * Unprocessed clock events stay queued; renderer cannot silently fire them.
   */
  step(deltaMs:number,externallyPaused:boolean,advanceTicks:(ticks:number)=>void):void {
    if(!Number.isFinite(deltaMs)||deltaMs<0)
      throw new RangeError("Invalid frame duration.");
    if(externallyPaused||this.isPaused){this.reset();return;}
    this.carriedMs=Math.min(MAX_BUFFERED_REAL_MS,this.carriedMs+deltaMs);
    const ticks=Math.min(MAX_WORLD_TICKS_PER_FRAME,
      Math.floor(this.carriedMs/REAL_MS_PER_WORLD_TICK));
    if(ticks===0)return;
    advanceTicks(ticks);
    this.carriedMs-=ticks*REAL_MS_PER_WORLD_TICK;
  }
}
