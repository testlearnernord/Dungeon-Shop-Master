import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay } from "../../src/game/gameState.ts";
import { quoteBeggingRequest, issueShopCredit } from "../../src/game/shopCredit.ts";
import { forecastShoppingIntents, shopperVisualAction } from "../../src/game/shopperIntents.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";

function hungryWithoutGold(){
  const original=createGameState(7351);
  const hero=original.adventurers[0];
  return {
    heroId:hero.id,
    state:{
      ...original,
      adventurers:original.adventurers.map(person=>person.id===hero.id
        ?{...person,gold:0,inventory:{...person.inventory,bread:0},
          equipment:{weapon:null,armor:null}}:person),
    },
  };
}

test("a penniless hero begs for needed bread rather than walking out or purchasing",()=>{
  const {state,heroId}=hungryWithoutGold();
  const plan=forecastShoppingIntents(state).get(heroId)!;
  assert.equal(plan.reason,"cannot-afford");
  assert.equal(plan.wantedItemId,"bread");
  assert.deepEqual(plan.items,[]);
  assert.equal(shopperVisualAction(plan,false),"beg");
  const quote=quoteBeggingRequest(state,heroId)!;
  assert.equal(quote.price,4);
  assert.equal(quote.gold,0);
  assert.equal(quote.previousDebt,0);
  assert.equal(quote.available,true);
});

test("credit costs exactly one real item and records debt, never cash or an automatic sale",()=>{
  const {state,heroId}=hungryWithoutGold();
  const before=structuredClone(state);
  const quote=quoteBeggingRequest(state,heroId)!;
  const oldShelf=state.shopEconomy.slots
    .filter(slot=>slot.itemId==="bread").reduce((sum,slot)=>sum+slot.quantity,0);
  const result=issueShopCredit(state,heroId);
  const hero=result.state.adventurers.find(entry=>entry.id===heroId)!;
  const newShelf=result.state.shopEconomy.slots
    .filter(slot=>slot.itemId==="bread").reduce((sum,slot)=>sum+slot.quantity,0);
  assert.deepEqual(state,before,"quoting and issuing credit must not mutate previous state");
  assert.equal(newShelf,oldShelf-1);
  assert.equal(hero.inventory.bread,1);
  assert.equal(hero.gold,0);
  assert.equal(hero.status,"returning");
  assert.equal(hero.floor,4);
  assert.equal(result.state.shopDebts[0].outstandingGold,quote.price);
  assert.equal(result.state.shopEconomy.balance,state.shopEconomy.balance);
  assert.deepEqual(result.state.shopEconomy.dailySales,state.shopEconomy.dailySales);
  assert.equal(result.state.events.filter(event=>event.type==="shop-credit").length,1);
  assert.equal(result.state.events.filter(event=>event.type==="sale").length,0);
  assert.equal(issueShopCredit(result.state,heroId).state,result.state,"request must not pay out twice");
  const saved=parseSave(JSON.stringify(createSave(result.state)));
  assert.deepEqual(saved,result.state);
  const nextDay=advanceDay(saved).state;
  assert.equal(nextDay.shopDebts[0].outstandingGold,quote.price);
  assert.equal(nextDay.events.filter(event=>event.type==="shop-credit").length,1);
});

test("no stock, held carts and paid/absent heroes cannot obtain credit",()=>{
  const {state,heroId}=hungryWithoutGold();
  const empty={...state,shopEconomy:{...state.shopEconomy,
    bag:{...state.shopEconomy.bag,bread:0},
    slots:state.shopEconomy.slots.map(slot=>slot.itemId==="bread"
      ?{...slot,itemId:null,quantity:0}:slot)}};
  assert.equal(quoteBeggingRequest(empty,heroId)?.available,false);
  assert.equal(issueShopCredit(empty,heroId).state,empty);
  const away={...state,adventurers:state.adventurers.map(hero=>hero.id===heroId
    ?{...hero,status:"returning" as const,floor:4 as const}:hero)};
  assert.equal(quoteBeggingRequest(away,heroId),null);
  const cart={...state,shopCarts:[{heroId,day:state.day,lines:[
    {slotId:"shelf-1-slot-2",itemId:"bread" as const,quantity:1,subtotal:4},
  ]}]};
  assert.equal(quoteBeggingRequest(cart,heroId),null);
});

test("legacy version 10 campaigns migrate without losing their unpaid carts",()=>{
  const {state}=hungryWithoutGold();
  const old=JSON.parse(JSON.stringify(createSave(state)));
  old.simulationVersion=10;
  old.payload.simulationVersion=10;
  delete old.payload.shopDebts;
  const restored=parseSave(JSON.stringify(old));
  assert.equal(restored.simulationVersion,11);
  assert.deepEqual(restored.shopCarts,state.shopCarts);
  assert.deepEqual(restored.shopDebts,[]);
});

test("forged or inconsistent debt records fail save validation",()=>{
  const {state,heroId}=hungryWithoutGold();
  const credited=issueShopCredit(state,heroId).state;
  const forged=JSON.parse(JSON.stringify(createSave(credited)));
  forged.payload.shopDebts[0].outstandingGold+=1;
  assert.throws(()=>parseSave(JSON.stringify(forged)),/shopDebts/);
  const fake=JSON.parse(JSON.stringify(createSave(credited)));
  fake.payload.events.find((event:{type:string})=>event.type==="shop-credit").debtGold=1;
  assert.throws(()=>parseSave(JSON.stringify(fake)),/debtGold/);
});
