import assert from "node:assert/strict";
import test from "node:test";
import { createGameState,advanceDay } from "../../src/game/gameState.ts";
import { forecastShoppingIntents,restockWaitRemaining,RESTOCK_WAIT_SECONDS,
  shopperVisualAction } from "../../src/game/shopperIntents.ts";
import { walkOutWithoutPurchase } from "../../src/game/shopWalkout.ts";

function emptyShop(){
  const original=createGameState(74192);
  const shopper=original.adventurers[0];
  const state={
    ...original,
    adventurers:original.adventurers.map((person,index)=>index===0
      ?{...person,status:"at-shop" as const,floor:5 as const,gold:100,
        inventory:{...person.inventory,food:0},equipment:{weapon:null,armor:null}}
      :{...person,status:"exploring" as const}),
    shopEconomy:{...original.shopEconomy,slots:original.shopEconomy.slots.map(slot=>({
      ...slot,itemId:null,quantity:0,
    }))},
  };
  return {state,heroId:shopper.id};
}

test("no affordable stock yields a truthful bread request and a 60-second waiting policy",()=>{
  const {state,heroId}=emptyShop();
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.equal(plan.reason,"unavailable");
  assert.equal(plan.wantedItemId,"bread");
  assert.deepEqual(plan.items,[]);
  assert.equal(shopperVisualAction(plan,false),"wait-restock");
  assert.equal(RESTOCK_WAIT_SECONDS,60);
  assert.equal(restockWaitRemaining(60,0.5),59.5);
  assert.equal(restockWaitRemaining(0.5,0.5),0);
  assert.equal(restockWaitRemaining(0,0.5),0);
  assert.throws(()=>restockWaitRemaining(60,-1),RangeError);
  assert.throws(()=>restockWaitRemaining(NaN,1),RangeError);
});

test("affordable sold-out bread is not mistaken for poverty when only expensive gear is stocked",()=>{
  const {state,heroId}=emptyShop();
  const mixed={
    ...state,
    adventurers:state.adventurers.map(hero=>hero.id===heroId
      ?{...hero,gold:4}:hero),
    shopEconomy:{...state.shopEconomy,
      slots:state.shopEconomy.slots.map((slot,index)=>index===0
        ?{...slot,itemId:"iron-sword" as const,quantity:1}:slot)},
  };
  const hungry=forecastShoppingIntents(mixed).get(heroId)!;
  assert.deepEqual(hungry.items,[]);
  assert.equal(hungry.reason,"unavailable");
  assert.equal(hungry.wantedItemId,"bread");
  assert.equal(shopperVisualAction(hungry,false),"wait-restock");

  const broke={...mixed,adventurers:mixed.adventurers.map(hero=>
    hero.id===heroId?{...hero,gold:0}:hero)};
  const noMoney=forecastShoppingIntents(broke).get(heroId)!;
  assert.equal(noMoney.reason,"cannot-afford");
  assert.equal(noMoney.wantedItemId,"bread");
  assert.equal(shopperVisualAction(noMoney,false),"beg");
});

test("replenishment reactivates the existing forecast before the wait expires",()=>{
  const {state,heroId}=emptyShop();
  const restocked={...state,shopEconomy:{...state.shopEconomy,
    slots:state.shopEconomy.slots.map(slot=>slot.id==="shelf-1-slot-2"
      ?{...slot,itemId:"bread" as const,quantity:4}:slot)}};
  const plan=forecastShoppingIntents(restocked).get(heroId)!;
  assert.equal(plan.reason,"interested");
  assert(plan.items.some(line=>line.itemId==="bread"));
  assert.equal(shopperVisualAction(plan,false),"shop");
  assert.equal(shopperVisualAction(plan,true),"checkout");
});

test("unpaid carts ALWAYS go to checkout even when shelves are sold out",()=>{
  const {state,heroId}=emptyShop();
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.equal(shopperVisualAction(plan,true),"checkout");
  assert.equal(shopperVisualAction(null,true),"checkout");
});

test("satisfied heroes leave, penniless hungry heroes beg instead of buying",()=>{
  const {state,heroId}=emptyShop();
  const hero=state.adventurers.find(x=>x.id===heroId)!;
  const satisfied={...state,adventurers:state.adventurers.map(x=>x.id===heroId
    ?{...x,inventory:{...x.inventory,food:2},equipment:{
      weapon:"Iron Sword",armor:"Leather Vest",
    }}:x)};
  const noNeed=forecastShoppingIntents(satisfied).get(heroId)!;
  assert.equal(noNeed.reason,"no-need");
  assert.equal(noNeed.wantedItemId,undefined);
  assert.equal(shopperVisualAction(noNeed,false),"leave-unserved");
  const withStock={...state,adventurers:state.adventurers.map(x=>x.id===heroId
    ?{...x,gold:0}:x),shopEconomy:{...state.shopEconomy,
      slots:state.shopEconomy.slots.map(slot=>slot.id==="shelf-1-slot-2"
        ?{...slot,itemId:"bread" as const,quantity:2}:slot)}};
  const broke=forecastShoppingIntents(withStock).get(heroId)!;
  assert.equal(broke.reason,"cannot-afford");
  assert.equal(broke.wantedItemId,"bread");
  assert.equal(shopperVisualAction(broke,false),"beg");
  assert.equal(hero.gold,100);
});

test("expired angry walkout persists and cannot create a phantom overnight sale",()=>{
  const {state,heroId}=emptyShop();
  const walked=walkOutWithoutPurchase(state,heroId,"unavailable");
  assert.notEqual(walked,state);
  assert.equal(walked.adventurers.find(person=>person.id===heroId)?.status,"returning");
  assert.equal(walked.shopEconomy.balance,state.shopEconomy.balance);
  assert(walked.events.some(event=>event.type==="shop-walkout"&&
    event.adventurerId===heroId&&event.message.includes("angry")));
  assert.equal(walkOutWithoutPurchase(walked,heroId,"unavailable"),walked);
  // Restocking afterwards is too late for THIS customer's completed visit.
  const stocked={...walked,shopEconomy:{...walked.shopEconomy,
    slots:walked.shopEconomy.slots.map(slot=>slot.id==="shelf-1-slot-2"
      ?{...slot,itemId:"bread" as const,quantity:4}:slot)}};
  const tick=advanceDay(stocked).state;
  assert(!tick.events.some(event=>event.type==="sale"&&
    event.adventurerId===heroId),"departed customer may not shop overnight");
  assert.equal(tick.shopEconomy.slots.find(slot=>slot.id==="shelf-1-slot-2")?.quantity,4);
});

test("an unpaid customer cannot walk out and silently abandon held shelf goods",()=>{
  const {state,heroId}=emptyShop();
  const reserved={...state,shopCarts:[{heroId,day:state.day,lines:[{
    itemId:"bread" as const,slotId:"shelf-1-slot-2",quantity:1,subtotal:4,
  }]}]};
  assert.equal(walkOutWithoutPurchase(reserved,heroId,"unavailable"),reserved);
});
