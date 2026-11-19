import type {GameState} from "./gameState.ts";
import {WORLD_TICKS_PER_GAME_MINUTE} from "./worldClock.ts";

/** World motion can commit twenty fixed steps per second, but IndexedDB
 * should not write 20 full snapshots a second. All material player actions,
 * scheduled-event changes, new games and manual payments still save
 * immediately. This is a persistence cadence, NEVER a simulation clock.
 */
export function shouldQueueCampaignSave(
  previous:GameState,current:GameState,lastQueuedTick:number,
):boolean{
  if(previous===current)return false;
  if(current.worldClock.tick<lastQueuedTick)return true;
  // A changed pending queue or sequence MUST be durable immediately.
  if(current.worldClock.pending!==previous.worldClock.pending||
     current.worldClock.nextSequence!==previous.worldClock.nextSequence)
    return true;
  for(const key of Object.keys(current) as (keyof GameState)[]){
    if(key!=="worldClock"&&current[key]!==previous[key])return true;
  }
  return current.worldClock.tick-lastQueuedTick>=WORLD_TICKS_PER_GAME_MINUTE;
}
