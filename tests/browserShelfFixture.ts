import {createEmptyShelfSlots} from "../src/game/economy.ts";
import type {GameState} from "../src/game/gameState.ts";
import {replaceShelfPlacement} from "../src/game/shopLayout.ts";

/** Browser-only authored merchandise. Production starts with zero shelves.
 * Keeps tests of autonomous buying physically meaningful without resurrecting
 * the obsolete pre-built / pre-stocked runtime setup. */
export function withStockedSmallShelf(state:GameState):GameState {
  const built=replaceShelfPlacement(state.shopLayout,{
    id:"shelf-1",x:-7,z:0,rotation:0,
  },state.level5Room);
  if(built.message!=="Shelf placement saved.")
    throw new Error("Cannot prepare browser shelf: "+built.message);
  const slots=createEmptyShelfSlots("shelf-1").map(slot=>
    slot.id==="shelf-1-slot-2"
      ?{...slot,itemId:"bread" as const,quantity:3}
      :slot.id==="shelf-1-slot-3"
        ?{...slot,itemId:"healing-herb" as const,quantity:2}
        :slot);
  return {...state,shopLayout:built.layout,
    shopEconomy:{...state.shopEconomy,slots}};
}
