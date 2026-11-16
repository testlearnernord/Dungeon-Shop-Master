import { Engine } from "@babylonjs/core/Engines/engine";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { GameStore } from "../src/game/gameStore.ts";
import { createGameState } from "../src/game/gameState.ts";
import { setupCashierHud } from "../src/cashierHud.ts";
import {counterDockPoint,replaceShelfPlacement} from "../src/game/shopLayout.ts";
import {createEmptyShelfSlots} from "../src/game/economy.ts";

/** Standalone test-only register: authoritative payment, no game-save edits. */
let harness:{store:GameStore;heroId:string;heroIds:readonly string[];
  initialGold:number;initialBalance:number;latestMessage:string;
  open:()=>string;close:()=>void}|null=null;

export function openCashierHarness(side:"staff"|"customer"="staff",
  customerCount:1|2=1) {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const canvas=document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
  const seeded=createGameState(72541);
  const hero=seeded.adventurers.find(person=>person.status==="at-shop")!;
  if(!hero)throw new Error("Fixture needs a visitor at the shop");
  const additional=customerCount===2
    ?seeded.adventurers.find(person=>person.id!==hero.id):undefined;
  if(customerCount===2&&!additional)
    throw new Error("Fixture needs a second independent visitor");
  const heroIds=[hero.id,...(additional?[additional.id]:[])];
  // Only the browser harness prepares a second genuine, fully payable
  // GameStore cart. Real production admission is still guarded by NPC
  // geometry and the front-of-line callback.
  const state={...seeded,adventurers:seeded.adventurers.map(person=>
    heroIds.includes(person.id)
      ?{...person,status:"at-shop" as const,
        health:Math.max(1,person.health),gold:100}
      :person)};
  const built=replaceShelfPlacement(state.shopLayout,{id:"shelf-1",x:-7,z:0,rotation:0});
  if(built.message!=="Shelf placement saved.")throw Error(built.message);
  const store=new GameStore({...state,shopLayout:built.layout,
    shopEconomy:{...state.shopEconomy,slots:createEmptyShelfSlots("shelf-1")},
    shopCarts:heroIds.map((id,index)=>({
      heroId:id,day:state.day,
      lines:[{itemId:"bread" as const,
        slotId:index===0?"shelf-1-slot-2":"shelf-1-slot-3",
        quantity:3,subtotal:12}],
    }))});
  // The real cashier refuses transactions from the customer side.
  const dock=counterDockPoint(store.state.shopLayout,side);
  camera.position.x=dock.x;camera.position.z=dock.z;
  // Only the test replaces the inactive production overlay. Its production
  // listener is idle, and the page's real save/game store remains untouched.
  document.querySelector("#cashier-overlay")?.remove();
  const controller=setupCashierHud(
    canvas,camera,store,()=>store.state.shopCarts[0]?.heroId??null,()=>true,
    (id,perfect)=>store.payReservedCart(id,perfect),
    message=>{if(harness)harness.latestMessage=message},
    ()=>{},()=>{},
  );
  harness={store,heroId:hero.id,heroIds,initialGold:100,
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
    manualReceiptsAll:state.events.filter(event=>event.type==="sale"&&
      event.saleChannel==="manual").length,
    paidCustomerIds:state.events.filter(event=>event.type==="sale"&&
      event.saleChannel==="manual").map(event=>event.adventurerId),
    tips:state.events.filter(event=>event.type==="tip"&&
      event.adventurerId===harness!.heroId).length,
    tipsAll:state.events.filter(event=>event.type==="tip").length,
    outstandingHeroIds:state.shopCarts.map(cart=>cart.heroId),
    report:harness.latestMessage,
  };
}
