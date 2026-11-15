import assert from "node:assert/strict";
import test from "node:test";
import {GameStore} from "../../src/game/gameStore.ts";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
import {createEmptyShelfSlots,tradeAtStartOfDay} from "../../src/game/economy.ts";
import {nextShelfId,replaceShelfPlacement,MAX_SHOP_SHELVES} from "../../src/game/shopLayout.ts";
import {createLevel5Room,excavateLevel5Cell,type Level5Room} from "../../src/game/level5Room.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {createShopRoutePlanner,pathToShelfAccess,pathToShopGoal,isObstructed} from "../../src/game/shopperNavigation.ts";
import {shelfServicePoint} from "../../src/game/furnitureRegistry.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

const origin={x:-3.43,z:4.65};
function openWing():Level5Room{
  let room:Level5Room={...createLevel5Room(),expansionTier:3};
  for(let x=8;x<=13;x++)for(let z=-5;z<=5;z++){
    const cut=excavateLevel5Cell(room,{x,z});
    assert(cut.ok,"mining must open "+x+","+z);
    room=cut.room;
  }
  return room;
}
const next={id:"shelf-3" as const,x:11,z:0,rotation:2 as const};

test("new shelf keeps a stable identity, creates five EMPTY slots and survives moving + save reload",()=>{
  const room=openWing();
  const initial=createGameState(7351);
  const store=new GameStore({...initial,level5Room:room});
  assert.equal(nextShelfId(store.state.shopLayout),"shelf-3");
  assert.equal(store.state.shopEconomy.slots.length,10);
  assert.equal(store.previewFurniturePlacement(next),null);
  assert.equal(store.state.shopLayout.shelves.length,2,"preview is read only");
  assert.equal(store.placeFurniture(next),"Shelf placement saved.");
  const state=store.state;
  assert.equal(state.shopLayout.shelves.length,3);
  assert.deepEqual(state.shopLayout.shelves[2],next);
  assert.deepEqual(state.shopEconomy.slots.slice(10),createEmptyShelfSlots("shelf-3"));
  assert.deepEqual(state.shopEconomy.bag,initial.shopEconomy.bag);
  assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.deepEqual(state.shopCarts,initial.shopCarts);
  assert.equal(nextShelfId(state.shopLayout),"shelf-4");
  assert.equal(shopServiceReachabilityProblem(state.shopLayout,room),null);
  for(let slot=0;slot<5;slot++){
    const dest=shelfServicePoint(next,slot);
    assert(!isObstructed(dest,state.shopLayout,room));
    assert(pathToShelfAccess(origin,state.shopLayout,next.id,slot,room),
      "every slot on new shelf must have an actual customer path");
    assert(pathToShopGoal(dest,{x:0,z:0},state.shopLayout,room));
  }
  const moved={...next,x:11.25};
  assert.equal(store.previewFurniturePlacement(moved),null);
  assert.equal(store.placeFurniture(moved),"Shelf placement saved.");
  assert.deepEqual(store.state.shopEconomy.slots.slice(10),state.shopEconomy.slots.slice(10),
    "moving furniture must never lose or duplicate stock/IDs");
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.shopLayout,store.state.shopLayout);
  assert.deepEqual(saved.shopEconomy.slots,store.state.shopEconomy.slots);
  assert.deepEqual(saved.level5Room,room);
});

test("customer demand, held inventory and deterministic day sales include new shelf stock",()=>{
  const base=createGameState(7351),room=openWing();
  const store=new GameStore({...base,level5Room:room,
    shopEconomy:{...base.shopEconomy,slots:base.shopEconomy.slots.map(slot=>({
      ...slot,itemId:null,quantity:0,
    }))},
    adventurers:base.adventurers.map((hero,index)=>index===0
      ?{...hero,status:"at-shop" as const,floor:5 as const,
        gold:100,inventory:{...hero.inventory,bread:0,healing:0}}
      :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
  });
  assert.equal(store.placeFurniture(next),"Shelf placement saved.");
  assert.equal(store.transfer("shelf-3-slot-2","bread","stock"),"Placed Waybread.");
  const plan=forecastShoppingIntents(store.state).get(store.state.adventurers[0].id);
  assert(plan?.items.some(item=>item.slotId==="shelf-3-slot-2"),
    "virtual purchases must reference the real newly stocked shelf");
  const daily=tradeAtStartOfDay(store.state,store.state.day+1);
  assert(daily.events.some(event=>event.type==="sale"&&
    event.id.endsWith(":sale:shelf-3-slot-2")));
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert(saved.shopEconomy.slots.some(s=>s.id==="shelf-3-slot-2"&&s.quantity===1));
  assert.equal(advanceDay(store.state).state.shopEconomy.slots.length,15);
});

test("invalid new shelves are atomic and strict saved layouts/slots cannot disagree",()=>{
  const initial=createGameState(),store=new GameStore(initial);
  const before=store.state;
  assert.equal(store.placeFurniture({id:"shelf-4",x:0,z:0,rotation:0}),
    "Only the next unused shelf can be built.");
  assert.strictEqual(store.state,before);
  assert.equal(store.placeFurniture(next)!=="Shelf placement saved.",true,
    "a new shelf cannot be built in rock outside the showroom");
  assert.strictEqual(store.state,before);
  const room=openWing();
  const withWing=new GameStore({...initial,level5Room:room});
  assert.equal(withWing.placeFurniture(next),"Shelf placement saved.");
  const valid=createSave(withWing.state);
  const clone=()=>structuredClone(valid);
  const withoutSlot=clone();
  withoutSlot.payload.shopEconomy.slots.pop();
  assert.throws(()=>parseSave(JSON.stringify(withoutSlot)),/five slots per placed shelf/);
  const orphan=clone();
  orphan.payload.shopEconomy.slots[10].shelfId="shelf-9";
  assert.throws(()=>parseSave(JSON.stringify(orphan)),/invalid slot ID/);
  const duplicate=clone();
  Object.assign(duplicate.payload.shopLayout.shelves[2],{id:"shelf-2"});
  assert.throws(()=>parseSave(JSON.stringify(duplicate)),/unique|contiguous|ordered/);
  assert.equal(nextShelfId({shelves:Array.from({length:MAX_SHOP_SHELVES},
    (_,i)=>({id:`shelf-${i+1}` as `shelf-${number}`,x:0,z:0,rotation:0 as const}))}),null);
  const invalid=replaceShelfPlacement(withWing.state.shopLayout,
    {id:"shelf-5",x:12,z:0,rotation:2},room);
  assert.strictEqual(invalid.layout,withWing.state.shopLayout);
});

test("expanded three-shelf rooms reuse batch navigation without stale rock or shelf cells",()=>{
  const room=openWing(),base=createGameState(7351);
  const store=new GameStore({...base,level5Room:room});
  assert.equal(store.placeFurniture(next),"Shelf placement saved.");
  const layout=store.state.shopLayout;
  const batch=createShopRoutePlanner(layout,room);
  const gateways=[{x:-3.43,z:4.65},{x:4.57,z:4.65}];
  for(const shelf of layout.shelves)for(let slot=0;slot<5;slot++){
    const target=shelfServicePoint(shelf,slot);
    for(const gate of gateways){
      assert.deepEqual(batch(gate,target),pathToShopGoal(gate,target,layout,room),
        "new and old shelves must use identical real room paths");
    }
  }
  const changed={...next,x:11.25};
  assert.equal(store.placeFurniture(changed),"Shelf placement saved.");
  const latest=createShopRoutePlanner(store.state.shopLayout,room);
  const goal=shelfServicePoint(changed,2);
  assert.deepEqual(latest(origin,goal),pathToShopGoal(origin,goal,store.state.shopLayout,room));
  assert.equal(shopServiceReachabilityProblem(store.state.shopLayout,room),null);
});
