import {createGameState,type GameState,type PopulationConfig} from "../../src/game/gameState.ts";
import {createEmptyShelfSlots} from "../../src/game/economy.ts";
import {createShopLayout,type ShopLayout} from "../../src/game/shopLayout.ts";

/** Explicit two-shelf test scene for sale/traffic regression only.
 * Production createGameState deliberately begins with ZERO shelves.
 * Each fixture shelf uses the current small model and four actual slots.
 */
export function createStockedShopLayout():ShopLayout {
  return {...createShopLayout(),shelves:[
    {id:"shelf-1",x:-7,z:0,rotation:0},
    {id:"shelf-2",x:7,z:0,rotation:2},
  ]};
}
export function createStockedShopState(
  seed?:number,config?:Partial<PopulationConfig>,
):GameState {
  const base=createGameState(seed,config);
  const slots=[
    ...createEmptyShelfSlots("shelf-1"),
    ...createEmptyShelfSlots("shelf-2"),
  ].map(slot=>slot.id==="shelf-1-slot-2"
    ?{...slot,itemId:"bread" as const,quantity:3}
    :slot.id==="shelf-1-slot-3"
      ?{...slot,itemId:"healing-herb" as const,quantity:2}
      :slot);
  return {...base,shopLayout:createStockedShopLayout(),
    shopEconomy:{...base.shopEconomy,slots}};
}
