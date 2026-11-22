import type {GameState,WorldEvent} from "../../src/game/gameState.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {cartTotal,pickUpShopItem,payReservedShopCart,type ShopCart}
  from "../../src/game/shopCarts.ts";

/** Test-only operator for real shelf pickup and the actual physical till.
 * There is deliberately no direct quote-to-sale API in game code. */
export function reserveWantedItems(state:GameState,heroId:string):{
  readonly state:GameState;readonly cart:ShopCart;
}{
  const plan=forecastShoppingIntents(state).get(heroId);
  if(!plan?.items.length)throw new Error("Fixture has no stocked, desired merchandise.");
  let held=state;
  for(const item of plan.items){
    const result=pickUpShopItem(held,heroId,item.slotId);
    if(result.state===held)throw new Error("Physical pickup failed: "+result.message+
      " ("+item.itemId+" in "+item.slotId+")");
    held=result.state;
  }
  const cart=held.shopCarts.find(entry=>entry.heroId===heroId);
  if(!cart)throw new Error("No physical cart created by pickup.");
  if(cartTotal(cart)<=0)throw new Error("Cart has no payable value.");
  return {state:held,cart};
}

export function payWantedItems(state:GameState,heroId:string):{
  readonly state:GameState;readonly held:GameState;
  readonly cart:ShopCart;readonly events:readonly WorldEvent[];
}{
  const picked=reserveWantedItems(state,heroId);
  if(picked.state.shopEconomy.balance!==state.shopEconomy.balance)
    throw new Error("Unpaid shelf pickup created revenue.");
  const paid=payReservedShopCart(picked.state,heroId);
  if(paid.state===picked.state)throw new Error("Real till rejected cart: "+paid.message);
  return {state:paid.state,held:picked.state,cart:picked.cart,
    events:paid.state.events.slice(state.events.length)};
}
