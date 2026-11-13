import type { GameState, WorldEvent } from "./gameState.ts";
import type { ShoppingReason } from "./shopperIntents.ts";

/** A shop visit can end during the actual 3D business day. The NPC walkout is
 * an authoritative transition, not just a disappearing mesh: a hero who left
 * cannot buy goods during the next end-day settlement after late restocking.
 * No sale, gold change, paid cart or dungeon simulation is invented here.
 */
export function walkOutWithoutPurchase(
  state:GameState, heroId:string, reason:ShoppingReason,
):GameState {
  const hero=state.adventurers.find(person=>person.id===heroId);
  if(!hero||hero.status!=="at-shop"||hero.health<=0||
    state.shopCarts.some(cart=>cart.heroId===heroId&&cart.lines.length>0))
    return state;
  const already=state.events.some(event=>event.day===state.day &&
    event.type==="shop-walkout"&&event.adventurerId===heroId);
  if(already)return state;
  const walkout:WorldEvent={
    id:`day-${state.day}:${heroId}:shop-walkout`,
    type:"shop-walkout",day:state.day,adventurerId:heroId,
    message: reason==="unavailable"
      ?`${hero.name} left the shop angry: their supplies were sold out.`
      :reason==="cannot-afford"
      ?`${hero.name} left the shop without buying anything.`
      :`${hero.name} left the shop without needing anything.`,
  };
  return {
    ...state,
    adventurers:state.adventurers.map(person=>person.id===heroId?
      {...person,status:"returning" as const,floor:4 as const,shopStayDays:0}:person),
    events:[...state.events,walkout],
  };
}
