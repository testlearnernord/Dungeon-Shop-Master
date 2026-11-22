import type {GameState,WorldEvent} from "./gameState.ts";

/** Day D is the physically observed exit. D+1 and D+2 are fully outside
 * both Galvik's shop and the dungeon. D+3 is the first eligible new day.
 * This is a state transition, not another movement/timing/loot authority.
 */
export const POST_SHOP_OFF_DUTY_DAYS=2;
const SHOP_OUTER_GATE_MIN_Z=12.88;
export function completeObservedShopExit(
  state:GameState,heroId:string,outerGateZ:number,
):GameState{
  if(!state.liveDungeon.enabled||!Number.isFinite(outerGateZ)||
     outerGateZ<SHOP_OUTER_GATE_MIN_Z)return state;
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero||hero.health<=0||
     (hero.status!=="departing"&&hero.status!=="at-shop"))return state;
  if(hero.status==="at-shop"&&!state.events.some(e=>
    e.day===state.day&&e.type==="sale"&&e.saleChannel==="manual"&&
    e.adventurerId===heroId))return state;
  if(state.shopCarts.some(cart=>cart.heroId===heroId))return state;
  const until=state.day+POST_SHOP_OFF_DUTY_DAYS+1;
  const event:WorldEvent={
    id:`day-${state.day}:${heroId}:shop-departure:${state.worldClock.tick}`,
    type:"shop-departure",day:state.day,worldTick:state.worldClock.tick,
    adventurerId:heroId,
    message:`${hero.name} crossed Galvik's exit. Days ${state.day+1} and ${state.day+2} are off duty; eligible Day ${until}.`,
  };
  return {...state,
    adventurers:state.adventurers.map(h=>h.id===heroId?
      {...h,status:"off-duty" as const,floor:"away" as const,
        shopStayDays:0,offDutyUntilDay:until}:h),
    events:[...state.events,event]};
}
