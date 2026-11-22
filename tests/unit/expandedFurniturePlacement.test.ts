import {createStockedShopLayout as createShopLayout} from "./shopFixtures.ts";
import {createStockedShopState as createGameState} from "./shopFixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {createLevel5Room,excavateLevel5Cell} from "../../src/game/level5Room.ts";
import { replaceShelfPlacement, replaceCounterPlacement } from "../../src/game/shopLayout.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {  } from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("seven actual adjoining rock cells support shelf relocation; one cell cannot",()=>{
  let room={...createLevel5Room(),expansionTier:1};
  const placement={id:"shelf-2" as const,x:8.25,z:0,rotation:2 as const};
  const first=excavateLevel5Cell(room,{x:8,z:0});
  assert(first.ok);
  room=first.room;
  const premature=replaceShelfPlacement(createShopLayout(),placement,room);
  assert.match(premature.message,/Excavate connected floor/);
  assert.deepEqual(premature.layout,createShopLayout());
  for(let z=-3;z<=3;z++){
    if(z===0)continue;
    const next=excavateLevel5Cell(room,{x:8,z});
    assert(next.ok,"cell z="+z);
    room=next.room;
  }
  const proposed=replaceShelfPlacement(createShopLayout(),placement,room);
  assert.equal(proposed.message,"Shelf placement saved.");
  assert.equal(shopServiceReachabilityProblem(proposed.layout,room),null);
  const before=createGameState(7351);
  const store=new GameStore({...before,shopRoom:room});
  assert.equal(store.placeFurniture(placement),"Shelf placement saved.");
  assert.deepEqual(store.state.shopLayout.shelves[1],placement);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).shopLayout,
    store.state.shopLayout);
});

test("a valid cashier on mined floor is accepted by the same preview and GameStore commit",()=>{
  let room={...createLevel5Room(),expansionTier:2};
  // A connected wing, four cells deep and wide enough for a cashier, staff
  // socket and customer queue. No hard-coded initial-room boundary applies.
  for(let x=8;x<=11;x++)for(let z=-6;z<=6;z++){
    const result=excavateLevel5Cell(room,{x,z});
    assert(result.ok,"every cell is connected to the existing side tunnel");
    room=result.room;
  }
  const state=createGameState(7351);
  const store=new GameStore({...state,shopRoom:room});
  const counter={id:"counter" as const,x:9.25,z:0,rotation:0 as const};
  const proposed=replaceCounterPlacement(state.shopLayout,counter,room);
  assert.equal(proposed.message,"Counter placement saved.");
  assert.equal(shopServiceReachabilityProblem(proposed.layout,room),null,
    "both entrances must reach checkout on the excavated wing");
  assert.notEqual(shopServiceReachabilityProblem(proposed.layout),null,
    "the original-room-only test rejects this candidate incorrectly");
  assert.equal(store.previewFurniturePlacement(counter),null);
  assert.equal(store.placeFurniture(counter),"Counter placement saved.");
  assert.deepEqual(store.state.shopLayout.counter,{
    x:counter.x,z:counter.z,rotation:counter.rotation,
  });
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).shopLayout,
    store.state.shopLayout);
});
