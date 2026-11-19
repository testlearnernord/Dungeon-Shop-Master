/** The ONE saved world clock. Twenty deterministic 50 ms simulation
 * slices equal one game minute (and one unpaused real second).
 * A shop day remains 24 foreground minutes, and ONLY the bed closes it.
 * Fractions of a minute are integral to realistic shop traffic and combat.
 */
export const WORLD_TICKS_PER_GAME_MINUTE=20;
export const WORLD_TICK_SECONDS=0.05;
export const WORLD_TICKS_PER_DAY=1440*WORLD_TICKS_PER_GAME_MINUTE;
export const MAX_WORLD_DAY=Math.floor(Number.MAX_SAFE_INTEGER/WORLD_TICKS_PER_DAY)-1;
export const MAX_PENDING_WORLD_EVENTS=4096;
export const MAX_EVENTS_PER_ADVANCE=4096;

export type WorldEventLane="shop-command"|"visitor"|"expedition"|"regeneration"|"report";
export interface ScheduledWorldEvent {
  readonly id:string;
  readonly dueTick:number;
  readonly lane:WorldEventLane;
  readonly subjectId:string;
  readonly sequence:number;
}
export interface WorldClockState {
  readonly tick:number;
  readonly nextSequence:number;
  readonly pending:readonly ScheduledWorldEvent[];
}
const priority:Record<WorldEventLane,number>={
  "shop-command":0,visitor:1,expedition:2,regeneration:3,report:4,
};
export function firstWorldTickOfDay(day:number):number {
  if(!Number.isSafeInteger(day)||day<1||day>MAX_WORLD_DAY)
    throw new RangeError("Invalid world day.");
  return (day-1)*WORLD_TICKS_PER_DAY;
}
export function lastWorldTickOfDay(day:number):number {
  return firstWorldTickOfDay(day)+WORLD_TICKS_PER_DAY-1;
}
export function createWorldClock():WorldClockState {
  return {tick:0,nextSequence:1,pending:[]};
}
export function compareScheduledWorldEvents(a:ScheduledWorldEvent,b:ScheduledWorldEvent):number {
  return a.dueTick-b.dueTick||priority[a.lane]-priority[b.lane]||a.sequence-b.sequence;
}
/** Player transactions are committed immediately. Queued events must be future-only.
 * Identity, lane priority and sequence are persisted, never recreated by FPS.
 */
export function scheduleWorldEvent(
  clock:WorldClockState,lane:WorldEventLane,dueTick:number,subjectId:string,
):WorldClockState {
  if(!Object.hasOwn(priority,lane))throw new RangeError("Unknown world event lane.");
  if(!Number.isSafeInteger(dueTick)||dueTick<=clock.tick)
    throw new RangeError("World events must be scheduled for a future safe tick.");
  if(!subjectId.trim()||subjectId.length>120)
    throw new RangeError("World event subject must be a bounded nonempty ID.");
  if(!Number.isSafeInteger(clock.nextSequence)||clock.nextSequence>=Number.MAX_SAFE_INTEGER)
    throw new RangeError("World event sequence exhausted.");
  if(clock.pending.length>=MAX_PENDING_WORLD_EVENTS)
    throw new RangeError("World event queue is full.");
  const sequence=clock.nextSequence;
  const event:ScheduledWorldEvent={id:"clock-"+sequence,lane,dueTick,subjectId,sequence};
  return {...clock,nextSequence:sequence+1,
    pending:[...clock.pending,event].sort(compareScheduledWorldEvents)};
}
/** One pure ordered event executor. Remove each event BEFORE committing it;
 * unhandled events must throw, not silently vanish or award invented loot.
 */
export function advanceWorldUntil<T extends {readonly day:number;readonly worldClock:WorldClockState}>(
  state:T,targetTick:number,commit:(state:T,event:ScheduledWorldEvent)=>T,
):T {
  if(!Number.isSafeInteger(targetTick)||targetTick<state.worldClock.tick||
     targetTick>lastWorldTickOfDay(state.day))
    throw new RangeError("World time cannot rewind or close a day without the bed.");
  let current=state;
  let processed=0;
  while(current.worldClock.pending.length){
    const event=current.worldClock.pending[0];
    if(event.dueTick>targetTick)break;
    if(++processed>MAX_EVENTS_PER_ADVANCE)
      throw new RangeError("World event advance exceeded its bounded budget.");
    if(event.dueTick<current.worldClock.tick)
      throw new RangeError("World event queue contains an already-due event.");
    const staged={...current,worldClock:{...current.worldClock,
      tick:event.dueTick,pending:current.worldClock.pending.slice(1)}} as T;
    const committed=commit(staged,event);
    if(committed.day!==state.day||committed.worldClock.tick!==event.dueTick)
      throw new RangeError("World event handler cannot change the clock or close the day.");
    current=committed;
  }
  if(current.worldClock.tick===targetTick)return current;
  return {...current,worldClock:{...current.worldClock,tick:targetTick}};
}
/** Temporary bedtime boundary until the actual in-day owners migrate.
 * Never skip queued work by sleeping: #202/#203 must consume it first.
 */
export function beginNextWorldDay(clock:WorldClockState,closedDay:number):WorldClockState {
  const boundary=firstWorldTickOfDay(closedDay+1);
  if(clock.tick>=boundary)throw new RangeError("World day already closed.");
  if(clock.pending.some(event=>event.dueTick<boundary))
    throw new RangeError("Cannot sleep past unprocessed world events.");
  return {...clock,tick:boundary};
}
