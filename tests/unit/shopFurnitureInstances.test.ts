import assert from "node:assert/strict";
import test from "node:test";
import {GameStore} from "../../src/game/gameStore.ts";
import {createGameState,advanceDay,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {createEmptyShelfSlots,tradeAtStartOfDay} from "../../src/game/economy.ts";
import {nextShelfId,replaceShelfPlacement,MAX_SHOP_SHELVES} from "../../src/game/shopLayout.ts";
import {SHELF_SLOT_COUNT,shelfServicePoint} from "../../src/game/furnitureRegistry.ts";
import {createLevel5Room,excavateLevel5Cell,type Level5Room} from "../../src/game/level5Room.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {createShopRoutePlanner,pathToShelfAccess,pathToShopGoal,isObstructed} from "../../src/game/shopperNavigation.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {shopPortalServicePoint} from "../../src/game/shopPortal.ts";

const origin=shopPortalServicePoint("entering");
function openWing():Level5Room{
  let room:Level5Room={...createLevel5Room(),expansionTier:3};
  for(let x=8;x<=13;x++)for(let z=-5;z<=5;z++){
    const cut=excavateLevel5Cell(room,{x,z});
    assert(cut.ok,"mining must open "+x+","+z);
    room=cut.room;
  }
  return room;
}
const first={id:"shelf-1" as const,x:11,z:0,rotation:2 as const};

test("new-game shop starts with NO fixed shelves, no display stock and a usable four-slot N blueprint",()=>{
  const state=createGameState(7351),store=new GameStore(state);
  assert.equal(SIMULATION_VERSION,36);
  assert.deepEqual(state.shopLayout.shelves,[]);
  assert.deepEqual(state.shopEconomy.slots,[]);
  assert.equal(nextShelfId(state.shopLayout),"shelf-1");
  assert.equal(SHELF_SLOT_COUNT,4);
  assert(state.shopEconomy.bag.bread>0,"real starter inventory remains in the bag");
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const placement={id:"shelf-1" as const,x:-7,z:0,rotation:0 as const};
  assert.equal(store.previewFurniturePlacement(placement),null);
  assert.strictEqual(store.state,state,"preview cannot manufacture shelves");
  assert.equal(store.placeFurniture(placement),"Shelf placement saved.");
  assert.deepEqual(store.state.shopEconomy.slots,createEmptyShelfSlots("shelf-1"));
  assert.equal(store.state.shopLayout.shelves.length,1);
  assert.equal(nextShelfId(store.state.shopLayout),"shelf-2");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("first built shelf in a real mined wing has four empty, stable slots and movable stock",()=>{
  const room=openWing(),initial=createGameState(7351);
  const store=new GameStore({...initial,shopRoom:room});
  assert.equal(store.previewFurniturePlacement(first),null);
  assert.equal(store.placeFurniture(first),"Shelf placement saved.");
  const state=store.state;
  assert.deepEqual(state.shopLayout.shelves,[first]);
  assert.deepEqual(state.shopEconomy.slots,createEmptyShelfSlots("shelf-1"));
  assert.deepEqual(state.shopEconomy.bag,initial.shopEconomy.bag);
  assert.equal(state.shopEconomy.balance,initial.shopEconomy.balance);
  assert.deepEqual(state.shopCarts,initial.shopCarts);
  assert.equal(shopServiceReachabilityProblem(state.shopLayout,room),null);
  for(let slot=0;slot<SHELF_SLOT_COUNT;slot++){
    const dest=shelfServicePoint(first,slot);
    assert(!isObstructed(dest,state.shopLayout,room));
    assert(pathToShelfAccess(origin,state.shopLayout,first.id,slot,room));
    assert(pathToShopGoal(dest,{x:0,z:0},state.shopLayout,room));
  }
  const moved={...first,x:11.25};
  assert.equal(store.previewFurniturePlacement(moved),null);
  assert.equal(store.placeFurniture(moved),"Shelf placement saved.");
  assert.deepEqual(store.state.shopEconomy.slots,state.shopEconomy.slots,
    "moving furniture preserves IDs, goods and quantities");
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.shopLayout,store.state.shopLayout);
  assert.deepEqual(saved.shopEconomy.slots,store.state.shopEconomy.slots);
});

test("buying from newly constructed shelf drives forecast, sale and day simulation",()=>{
  const base=createGameState(7351),room=openWing();
  const store=new GameStore({...base,shopRoom:room,
    adventurers:base.adventurers.map((hero,index)=>index===0
      ?{...hero,status:"at-shop" as const,floor:"shop" as const,
        gold:100,inventory:{...hero.inventory,bread:0,healing:0}}
      :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
  });
  assert.equal(store.placeFurniture(first),"Shelf placement saved.");
  assert.equal(store.transfer("shelf-1-slot-2","bread","stock"),"Placed Waybread.");
  const plan=forecastShoppingIntents(store.state).get(store.state.adventurers[0].id);
  assert(plan?.items.some(item=>item.slotId==="shelf-1-slot-2"));
  const daily=tradeAtStartOfDay(store.state,store.state.day+1);
  assert(daily.events.some(event=>event.type==="sale"&&
    event.id.endsWith(":sale:shelf-1-slot-2")));
  assert.equal(advanceDay(store.state).state.shopEconomy.slots.length,4);
  assert(parseSave(JSON.stringify(createSave(store.state)))
    .shopEconomy.slots.some(slot=>slot.id==="shelf-1-slot-2"&&slot.quantity===1));
});

test("invalid new shelves are atomic and strict persistence rejects any orphan, missing or duplicate slots",()=>{
  const initial=createGameState(),store=new GameStore(initial);
  assert.equal(store.placeFurniture({id:"shelf-4",x:0,z:0,rotation:0}),
    "Only the next unused shelf can be built.");
  assert.strictEqual(store.state,initial);
  assert.notEqual(store.placeFurniture(first),"Shelf placement saved.",
    "a new shelf cannot be built inside unmined rock");
  assert.strictEqual(store.state,initial);
  const room=openWing(),built=new GameStore({...initial,shopRoom:room});
  assert.equal(built.placeFurniture(first),"Shelf placement saved.");
  const valid=createSave(built.state),clone=()=>structuredClone(valid);
  const missing=clone();
  missing.payload.shopEconomy.slots.pop();
  assert.throws(()=>parseSave(JSON.stringify(missing)),/four slots per placed shelf/);
  const orphan=clone();
  orphan.payload.shopEconomy.slots[0].shelfId="shelf-9";
  assert.throws(()=>parseSave(JSON.stringify(orphan)),/invalid slot ID/);
  const duplicate=clone();
  duplicate.payload.shopLayout.shelves.push({...duplicate.payload.shopLayout.shelves[0]});
  assert.throws(()=>parseSave(JSON.stringify(duplicate)),/unique|contiguous|ordered/);
  const invalid=replaceShelfPlacement(built.state.shopLayout,
    {id:"shelf-5",x:12,z:0,rotation:2},room);
  assert.strictEqual(invalid.layout,built.state.shopLayout);
  assert.equal(nextShelfId({shelves:Array.from({length:MAX_SHOP_SHELVES},
    (_,i)=>({id:`shelf-${i+1}` as `shelf-${number}`,x:0,z:0,rotation:0 as const}))}),null);
});

test("three deliberately built shelves use the same real mined-floor routes after rearranging",()=>{
  const room=openWing(),base=createGameState(7351);
  const store=new GameStore({...base,shopRoom:room});
  const startShelves=[
    {id:"shelf-1" as const,x:-7,z:0,rotation:0 as const},
    {id:"shelf-2" as const,x:7,z:0,rotation:2 as const},
    {id:"shelf-3" as const,x:11,z:0,rotation:2 as const},
  ];
  for(const pose of startShelves)
    assert.equal(store.placeFurniture(pose),"Shelf placement saved.");
  assert.equal(store.state.shopEconomy.slots.length,3*SHELF_SLOT_COUNT);
  const layout=store.state.shopLayout,batch=createShopRoutePlanner(layout,room);
  const gateways=[shopPortalServicePoint("entering"),shopPortalServicePoint("leaving")];
  for(const shelf of layout.shelves)for(let slot=0;slot<SHELF_SLOT_COUNT;slot++){
    const target=shelfServicePoint(shelf,slot);
    for(const gate of gateways)
      assert.deepEqual(batch(gate,target),pathToShopGoal(gate,target,layout,room));
  }
  const changed={...startShelves[2],x:11.25};
  assert.equal(store.placeFurniture(changed),"Shelf placement saved.");
  const latest=createShopRoutePlanner(store.state.shopLayout,room);
  const goal=shelfServicePoint(changed,2);
  assert.deepEqual(latest(origin,goal),
    pathToShopGoal(origin,goal,store.state.shopLayout,room));
  assert.equal(shopServiceReachabilityProblem(store.state.shopLayout,room),null);
});
