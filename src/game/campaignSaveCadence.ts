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
  // Worker locomotion, routes, waiting ages and service timers are physical
  // checkpoints just like shopTraffic. Persist only actual configuration or
  // stock-reservation changes immediately, not every 50 ms of movement.
  if(previous.employees!==current.employees){
    if(previous.employees.length!==current.employees.length)return true;
    for(const worker of current.employees){
      const old=previous.employees.find(e=>e.id===worker.id);
      if(!old||old.priorities.cashier!==worker.priorities.cashier||
        old.priorities.restocking!==worker.priorities.restocking||
        old.priorities.charity!==worker.priorities.charity||
        old.restock?.slotId!==worker.restock?.slotId||
        old.restock?.itemId!==worker.restock?.itemId||
        old.restock?.units!==worker.restock?.units||
        old.restock?.stage!==worker.restock?.stage)return true;
    }
  }
  for(const key of Object.keys(current) as (keyof GameState)[]){
    // Clock-driven movement snapshots are sampled alongside the clock.
    if(key!=="worldClock"&&key!=="shopTraffic"&&key!=="employees"&&
       current[key]!==previous[key])return true;
  }
  return current.worldClock.tick-lastQueuedTick>=WORLD_TICKS_PER_GAME_MINUTE;
}
