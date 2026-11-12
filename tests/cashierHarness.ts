import { Engine } from "@babylonjs/core/Engines/engine";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { GameStore } from "../src/game/gameStore.ts";
import { createGameState } from "../src/game/gameState.ts";
import { setupCashierHud } from "../src/cashierHud.ts";

/** Standalone test-only register: authoritative payment, no game-save edits. */
let harness:{store:GameStore;heroId:string;initialGold:number;
  initialBalance:number;latestMessage:string;open:()=>string;close:()=>void}|null=null;

export function openCashierHarness() {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const canvas=document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
  const state=createGameState(72541);
  const hero=state.adventurers.find(person=>person.status==="at-shop")!;
  if(!hero)throw new Error("Fixture needs a visitor at the shop");
  const store=new GameStore({...state,shopCarts:[{
    heroId:hero.id,day:state.day,
    lines:[{itemId:"bread",slotId:"shelf-1-slot-2",quantity:1,subtotal:4}],
  }]});
  // Only the test replaces the inactive production overlay. Its production
  // listener is idle, and the page's real save/game store remains untouched.
  document.querySelector("#cashier-overlay")?.remove();
  const controller=setupCashierHud(
    canvas,camera,store,()=>hero.id,()=>true,
    (id,perfect)=>store.payReservedCart(id,perfect),
    message=>{if(harness)harness.latestMessage=message},
    ()=>{},()=>{},
  );
  harness={store,heroId:hero.id,initialGold:hero.gold,
    initialBalance:state.shopEconomy.balance,latestMessage:"",
    open:controller.open,close:controller.close};
  return {openResult:controller.open(),...inspectCashierHarness()};
}
export function inspectCashierHarness(){
  if(!harness)throw new Error("Register harness not started");
  const state=harness.store.state;
  return {
    customer:harness.heroId,
    gold:state.adventurers.find(hero=>hero.id===harness!.heroId)!.gold,
    balance:state.shopEconomy.balance,
    initialGold:harness.initialGold,
    initialBalance:harness.initialBalance,
    carts:state.shopCarts.length,
    manualReceipts:state.events.filter(event=>event.type==="sale"&&
      event.saleChannel==="manual"&&event.adventurerId===harness!.heroId).length,
    report:harness.latestMessage,
  };
}
