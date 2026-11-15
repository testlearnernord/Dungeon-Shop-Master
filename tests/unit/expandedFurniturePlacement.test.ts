import assert from "node:assert/strict";
import test from "node:test";
import {createLevel5Room,excavateLevel5Cell} from "../../src/game/level5Room.ts";
import {createShopLayout,replaceShelfPlacement} from "../../src/game/shopLayout.ts";
import {shopServiceReachabilityProblem} from "../../src/game/shopServiceReachability.ts";
import {createGameState} from "../../src/game/gameState.ts";
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
  const store=new GameStore({...before,level5Room:room});
  assert.equal(store.placeShelf(placement),"Shelf placement saved.");
  assert.deepEqual(store.state.shopLayout.shelves[1],placement);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).shopLayout,
    store.state.shopLayout);
});
