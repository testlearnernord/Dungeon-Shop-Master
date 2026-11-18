import type {GameState} from "./gameState.ts";
import {walkOutWithoutPurchase} from "./shopWalkout.ts";
import {forecastShoppingIntents,type ShoppingReason} from "./shopperIntents.ts";
import {scheduleWorldEvent,type ScheduledWorldEvent} from "./worldClock.ts";
import type {ItemId} from "./economy.ts";

/** Request countdowns belong to committed world time, not Babylon frames.
 * The request remains attached to a specific visitor, even if furniture
 * moves or the shop UI is opened and closed.
 */
export interface ShopRequest {
  readonly heroId:string;
  readonly reason:"unavailable"|"cannot-afford";
  readonly itemId:ItemId;
  readonly startedTick:number;
  readonly dueTick:number;
  readonly eventId:string;
}
export const SHOP_REQUEST_TICKS=60;

export function requestRemainingTicks(state:GameState,heroId:string):number|null {
  const request=state.shopRequests.find(item=>item.heroId===heroId);
  return request?Math.max(0,request.dueTick-state.worldClock.tick):null;
}

function withoutRequest(state:GameState,heroId:string):GameState {
  const request=state.shopRequests.find(item=>item.heroId===heroId);
  if(!request)return state;
  return {
    ...state,
    shopRequests:state.shopRequests.filter(item=>item.heroId!==heroId),
    worldClock:{...state.worldClock,pending:state.worldClock.pending.filter(
      event=>event.id!==request.eventId)},
  };
}

/** Start only after a *physical* visitor begins an actual petition. Existing
 * requests are stable across reroutes, re-evaluation, reload and FPS.
 */
export function startShopRequest(
  state:GameState,heroId:string,itemId:ItemId,reason:ShoppingReason,
  durationTicks=SHOP_REQUEST_TICKS,
):GameState {
  if(reason!=="unavailable"&&reason!=="cannot-afford")return state;
  const hero=state.adventurers.find(entry=>entry.id===heroId);
  const plan=forecastShoppingIntents(state).get(heroId);
  if(!hero||hero.status!=="at-shop"||hero.health<=0||
     plan?.reason!==reason||plan.wantedItemId!==itemId||
     !Number.isSafeInteger(durationTicks)||durationTicks<1||durationTicks>SHOP_REQUEST_TICKS)
    return state;
  const old=state.shopRequests.find(entry=>entry.heroId===heroId);
  if(old)return state;
  const dueTick=state.worldClock.tick+durationTicks;
  if(!Number.isSafeInteger(dueTick))throw new RangeError("Shop request time overflow.");
  const clock=scheduleWorldEvent(state.worldClock,"visitor",dueTick,heroId);
  const scheduled=clock.pending.find(entry=>entry.sequence===state.worldClock.nextSequence)!;
  return {...state,worldClock:clock,shopRequests:[
    ...state.shopRequests,{heroId,itemId,reason,startedTick:state.worldClock.tick,
      dueTick,eventId:scheduled.id},
  ]};
}

/** Explicit test-controlled reduction of a real scheduled deadline. */
export function shortenShopRequestForTest(state:GameState,heroId:string,remainingTicks:number):GameState {
  if(!Number.isSafeInteger(remainingTicks)||remainingTicks<1||remainingTicks>SHOP_REQUEST_TICKS)
    throw new RangeError("Invalid request time adjustment.");
  const previous=state.shopRequests.find(entry=>entry.heroId===heroId);
  if(!previous)throw new RangeError("Shop request has not begun.");
  const base=withoutRequest(state,heroId);
  return startShopRequest(base,heroId,previous.itemId,previous.reason,remainingTicks);
}

/** Inventory, credit, payment or departure can invalidate a petition.
 * A later stock refill is not a reason to silently renew its old deadline.
 */
export function clearResolvedShopRequests(state:GameState):GameState {
  if(!state.shopRequests.length)return state;
  const plans=forecastShoppingIntents(state);
  let next=state;
  for(const entry of state.shopRequests){
    const hero=state.adventurers.find(h=>h.id===entry.heroId);
    const plan=plans.get(entry.heroId);
    if(!hero||hero.status!=="at-shop"||hero.health<=0||
       plan?.reason!==entry.reason||plan.wantedItemId!==entry.itemId)
      next=withoutRequest(next,entry.heroId);
  }
  return next;
}

/** Exactly-once expiry. The scheduler has already detached the due event.
 * No item handover, paid receipt, RNG roll or invented sale occurs here.
 */
export function commitShopRequestEvent(state:GameState,event:ScheduledWorldEvent):GameState {
  if(event.lane!=="visitor")throw new Error("Unhandled shop world event: "+event.id);
  const request=state.shopRequests.find(entry=>entry.eventId===event.id);
  if(!request||request.heroId!==event.subjectId||request.dueTick!==event.dueTick)
    throw new Error("Orphaned shop request event: "+event.id);
  const remaining={...state,shopRequests:state.shopRequests.filter(
    entry=>entry.eventId!==event.id)};
  const plan=forecastShoppingIntents(remaining).get(request.heroId);
  return plan?.reason===request.reason && plan.wantedItemId===request.itemId
    ?walkOutWithoutPurchase(remaining,request.heroId,request.reason):remaining;
}

/** The shop closes without carrying physical petitions into the next day.
 * Future visitor notifications for an obsolete visit cannot fire after sleep.
 */
export function closeShopRequests(state:GameState):GameState {
  let next=state;
  for(const request of state.shopRequests)next=withoutRequest(next,request.heroId);
  return next;
}
