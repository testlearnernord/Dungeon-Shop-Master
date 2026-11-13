import assert from "node:assert/strict";
import test from "node:test";
import {generateAdventurer, useHealingSupplies} from "../../src/game/adventurers.ts";
import {createGameState, advanceDay, SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {ITEMS, ECONOMY, tradeAtStartOfDay} from "../../src/game/economy.ts";
import {createSave, parseSave} from "../../src/game/campaignSave.ts";

const wounded=(lost:number)=> {
  const hero=generateAdventurer(1,42).adventurer;
  return {...hero,health:hero.stats.maxHealth-lost};
};

test("Waybread and herbs keep their prices and heal 8/18 HP",()=>{
  const bread=ITEMS.find(item=>item.id==="bread")!;
  const herb=ITEMS.find(item=>item.id==="healing-herb")!;
  assert.deepEqual([bread.wholesaleCost,bread.salePrice,bread.healing],[2,4,8]);
  assert.deepEqual([herb.wholesaleCost,herb.salePrice,herb.healing],[3,6,18]);
  assert.equal(bread.kind,"healing");
  assert.equal(ECONOMY.breadCarryLimit,2);
});

test("full-health heroes never spend bread or herbs, even after many days",()=>{
  const hero={...wounded(0),inventory:{loot:0,bread:2,healing:1}};
  let current=hero;
  for(let day=2;day<20;day++){
    const result=useHealingSupplies(current,day);
    assert.equal(result.adventurer,current);
    assert.deepEqual(result.events,[]);
    current=result.adventurer;
  }
});

test("minor damage uses cheaper bread, severe wounds use stronger herbs",()=>{
  const hero={...wounded(7),inventory:{loot:0,bread:2,healing:1}};
  const small=useHealingSupplies(hero,2);
  assert.equal(small.adventurer.health,hero.stats.maxHealth);
  assert.equal(small.adventurer.inventory.bread,1);
  assert.equal(small.adventurer.inventory.healing,1);
  assert.equal(small.events[0].itemId,"bread");

  const severe=useHealingSupplies({...hero,health:hero.stats.maxHealth-22},2);
  assert.equal(severe.adventurer.health,hero.stats.maxHealth-4);
  assert.equal(severe.adventurer.inventory.bread,2);
  assert.equal(severe.adventurer.inventory.healing,0);
  assert.equal(severe.events[0].itemId,"healing-herb");

  const fallback=useHealingSupplies({...hero,inventory:{loot:0,bread:1,healing:0}},2);
  assert.equal(fallback.adventurer.inventory.bread,0);
  const dead=useHealingSupplies({...hero,status:"dead" as const,health:0},2);
  assert.equal(dead.events.length,0);
});

test("shop sells appropriate treatment without free rations or fake healing",()=>{
  const base=createGameState(42);
  const hero={...base.adventurers[0],health:base.adventurers[0].stats.maxHealth-7};
  const state={...base,adventurers:[hero,...base.adventurers.slice(1)]};
  const result=tradeAtStartOfDay(state,2);
  const customer=result.adventurers[0];
  assert.equal(customer.inventory.bread,1);
  assert.equal(customer.inventory.healing,0);
  assert.equal(customer.gold,hero.gold-4);
  assert.equal(result.economy.balance,base.shopEconomy.balance+4);
  assert(result.events.some(event=>event.type==="sale"&&event.itemId==="bread"));
  const used=useHealingSupplies(customer,2);
  assert.equal(used.adventurer.health,hero.stats.maxHealth);
  assert.equal(used.adventurer.inventory.bread,0);
});

test("unfunded days cause neither starvation nor emergency bread drops",()=>{
  let state=createGameState(42);
  const empty=state.shopEconomy.slots.map(slot=>({...slot,itemId:null,quantity:0}));
  state={...state,shopEconomy:{...state.shopEconomy,balance:0,bag:{
    ...state.shopEconomy.bag,bread:0},slots:empty}};
  const result=advanceDay(state);
  assert(result.events.every(event=>!["starvation","food-shortage","rescue","ate","found-food"].includes(event.type)));
  assert.equal(result.state.shopEconomy.bag.bread,0);
  assert(result.state.adventurers.every(hero=>!("hunger" in hero)&&!("missedFoodShopVisits" in hero)));
});

test("v12 rejects old saves and legacy hunger fields, no migrations",()=>{
  const state=createGameState(2026);
  assert.equal(SIMULATION_VERSION,12);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const old=structuredClone(createSave(state));
  old.simulationVersion=11;
  assert.throws(()=>parseSave(JSON.stringify(old)),/incompatible/);
  const injected=structuredClone(createSave(state)) as any;
  injected.payload.adventurers[0].hunger=0;
  assert.throws(()=>parseSave(JSON.stringify(injected)),/hunger/);
  const legacy=structuredClone(createSave(state)) as any;
  legacy.payload.adventurers[0].inventory.food=1;
  assert.throws(()=>parseSave(JSON.stringify(legacy)),/food/);
});
