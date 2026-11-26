import type {GameState,WorldEvent} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import {manuallyPaidVisitors} from "./npcVisitors.ts";

/** World-clock ticks, not calendar days. No free HP benefit.
 * Reentry is committed at the next existing dungeon movement event. */
export const MAX_POST_SHOP_RECOVERY_TICKS=4800;
export function postShopRecoveryTicks(hero:AdventurerState):number{
  const ratio=hero.health/heroProgression(hero).maxHealth;
  if(ratio>=.9)return 400;
  if(ratio>=.65)return 1200;
  return hero.inventory.bread+hero.inventory.healing>0?2400:MAX_POST_SHOP_RECOVERY_TICKS;
}
const SHOP_OUTER_GATE_MIN_Z=12.88;
export function completeObservedShopExit(
  state:GameState,heroId:string,outerGateZ:number,
):GameState{
  if(!state.liveDungeon.enabled||!Number.isFinite(outerGateZ)||
     outerGateZ<SHOP_OUTER_GATE_MIN_Z)return state;
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero||hero.health<=0||
     (hero.status!=="departing"&&hero.status!=="at-shop"))return state;
  if(hero.status==="at-shop"&&!manuallyPaidVisitors(state.events,state.day).has(heroId))return state;
  if(state.shopCarts.some(cart=>cart.heroId===heroId))return state;
  const until=state.worldClock.tick+postShopRecoveryTicks(hero);
  const event:WorldEvent={
    id:`day-${state.day}:${heroId}:shop-departure:${state.worldClock.tick}`,
    type:"shop-departure",day:state.day,worldTick:state.worldClock.tick,
    adventurerId:heroId,
    message:`${hero.name} crossed Galvik's exit to prepare for another expedition.`,
  };
  return {...state,
    adventurers:state.adventurers.map(h=>h.id===heroId?
      {...h,status:"off-duty" as const,floor:"away" as const,
        shopStayDays:0,offDutyUntilTick:until,lastShopExitTick:state.worldClock.tick}:h),
    events:[...state.events,event]};
}
