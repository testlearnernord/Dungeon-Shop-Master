import type {WorldEvent} from "./gameState.ts";

/** Latest played day plus two fully completed days of automatic footage.
 * Only consciously saved tapes survive that window.
 */
export const REPLAY_LOOKBACK_DAYS=2;
export const MAX_SAVED_REPLAYS=12;
export const containsReplay=(event:WorldEvent):boolean=>
  !!(event.dungeonReplay||event.partyBossReplay);

/** The event trail is retained for world knowledge and accountability,
 * but heavy positional/combat frames expire. Never touch event identities,
 * committed outcomes, economics, deaths, parties or world time.
 */
export function compactReplayFootage(
  events:readonly WorldEvent[],currentDay:number,
  savedIds:readonly string[],
):readonly WorldEvent[] {
  const pinned=new Set(savedIds);
  return events.map(event=>{
    if(event.day>=currentDay-REPLAY_LOOKBACK_DAYS||
      pinned.has(event.id)||!containsReplay(event))return event;
    const {dungeonReplay:_dungeon,partyBossReplay:_partyBoss,...fact}=event;
    return fact;
  });
}
