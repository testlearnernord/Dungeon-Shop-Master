import assert from "node:assert/strict";
import test from "node:test";
import {createShopLayout,replaceShelfPlacement} from "../../src/game/shopLayout.ts";
import {rosterBoardAtWall,rosterBoardProblem,replaceRosterBoard,
  DEFAULT_ROSTER_BOARD} from "../../src/game/rosterBoardPlacement.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("roster board stays on the old wall by default and can move to the other shop wall",()=>{
  const layout=createShopLayout();
  assert.equal(rosterBoardProblem(DEFAULT_ROSTER_BOARD,layout),null);
  const newSpot=rosterBoardAtWall("front-wall",{x:5.53,z:-7})!;
  assert.deepEqual(newSpot,{x:5.5,z:-6.45,rotation:2});
  const applied=replaceRosterBoard(undefined,newSpot,layout);
  assert.equal(applied.message,"Adventurer board placed.");
  assert.deepEqual(applied.placement,newSpot);
  assert.equal(rosterBoardProblem(newSpot,layout),null);
  assert.equal(rosterBoardProblem({x:0,z:0,rotation:0},layout),
    "Mount the board on a clear main-shop wall.");
});
test("board side walls do not allow hiding the board behind shelves or in dungeon gates",()=>{
  const layout=createShopLayout();
  assert.equal(rosterBoardProblem(rosterBoardAtWall("right-wall",{x:7.5,z:0})!,layout),
    "The board would be covered by a shelf.");
  assert.equal(rosterBoardProblem(rosterBoardAtWall("right-wall",{x:7.5,z:5})!,layout),null);
  assert(rosterBoardProblem({x:7.22,z:6.5,rotation:1},layout));
  assert.equal(rosterBoardAtWall("back-wall",{x:0,z:7}),null);
  const next=replaceShelfPlacement(layout,{id:"shelf-1",x:-5.25,z:-5.25,rotation:1});
  if(next.layout!==layout)
    assert(rosterBoardProblem(DEFAULT_ROSTER_BOARD,next.layout));
});
test("board placement is saved independently of the heroes and existing v12 campaigns",()=>{
  const initial=createGameState();
  const store=new GameStore(initial);
  const moved={x:5.5,z:-6.45,rotation:2 as const};
  assert.equal(store.placeRosterBoard(moved),"Adventurer board placed.");
  assert.deepEqual(store.state.rosterBoard,moved);
  assert.equal(store.state.adventurers,initial.adventurers);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).rosterBoard,moved);
  const {rosterBoard:unused,...older}=initial;
  const restored=parseSave(JSON.stringify(createSave(older)));
  assert.equal(restored.rosterBoard,undefined);
  assert.equal(store.placeRosterBoard({x:0,z:0,rotation:0}),"Mount the board on a clear main-shop wall.");
  assert.deepEqual(store.state.rosterBoard,moved);
  for(const invalid of [{x:0,z:0,rotation:0},{x:7.22,z:0,rotation:1}]){
    assert.throws(()=>createSave({...initial,rosterBoard:invalid as any}),/rosterBoard/);
  }
});
