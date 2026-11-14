import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../../src/game/gameState.ts";
import { GameStore } from "../../src/game/gameStore.ts";
import { createSave,parseSave } from "../../src/game/campaignSave.ts";
import {BEDROOM_DEFAULTS,bedroomFurnitureProblem,
  createBedroomFurnitureLayout,bedroomFurnitureOverlapsActor,
  getBedroomFurniture,replaceBedroomFurniture} from "../../src/game/bedroomFurniture.ts";

test("the original bedroom remains valid and all three modules can move independently",()=>{
  const initial=createBedroomFurnitureLayout();
  assert.equal(bedroomFurnitureProblem(initial),null);
  assert.deepEqual(initial,BEDROOM_DEFAULTS);
  const moved=replaceBedroomFurniture(initial,{id:"chest",x:-2.25,z:-10.25,rotation:1});
  assert.equal(moved.message,"Bedroom furniture placed.");
  assert.notEqual(moved.layout,initial);
  assert.equal(bedroomFurnitureProblem(moved.layout),null);
  assert.equal(getBedroomFurniture(moved.layout,"chest").z,-10.25);
  assert.equal(getBedroomFurniture(initial,"chest").z,-11.3);
  assert.equal(getBedroomFurniture(moved.layout,"desk").z,-9.08);
  assert.equal(getBedroomFurniture(moved.layout,"candle").z,-10.95);
  assert(bedroomFurnitureOverlapsActor(
    getBedroomFurniture(moved.layout,"chest"),{x:-2.25,z:-10.25,radius:0.35}));
});

test("invalid placements cannot block the sleeping bed, doorway, wall or other fixtures",()=>{
  const base=createBedroomFurnitureLayout();
  for(const candidate of [
    {id:"chest" as const,x:0.75,z:-10.5,rotation:0 as const},
    {id:"desk" as const,x:0,z:-8,rotation:0 as const},
    {id:"candle" as const,x:3,z:-11,rotation:0 as const},
    {id:"chest" as const,x:-2.25,z:-9.25,rotation:0 as const},
    {id:"chest" as const,x:-2.23,z:-10,rotation:0 as const},
  ]){
    const result=replaceBedroomFurniture(base,candidate);
    assert.equal(result.layout,base,"reject "+JSON.stringify(candidate));
    assert.notEqual(result.message,"Bedroom furniture placed.");
  }
});

test("bedroom movement preserves inventory, hero simulation, and existing v12 saves",()=>{
  const initial=createGameState(7351);
  const store=new GameStore(initial);
  const changed=store.placeBedroomFurniture({id:"desk",x:-2.25,z:-9.75,rotation:1});
  assert.equal(changed,"Bedroom furniture placed.");
  assert.equal(getBedroomFurniture(store.state.bedroomFurniture,"desk").z,-9.75);
  assert.equal(store.state.shopEconomy,initial.shopEconomy);
  assert.equal(store.state.adventurers,initial.adventurers);
  const roundTrip=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(roundTrip.bedroomFurniture,store.state.bedroomFurniture);
  // Older v12 saves omit bedroomFurniture. They still load with physical
  // defaults without any migration or simulation-version change.
  const {bedroomFurniture:removed,...legacy}=initial;
  const loaded=parseSave(JSON.stringify(createSave(legacy)));
  assert.equal(loaded.bedroomFurniture,undefined);
  assert.equal(getBedroomFurniture(loaded.bedroomFurniture,"desk").z,-9.08);
});

test("strict saves reject tampered bedroom placement coordinates and duplicate IDs",()=>{
  const initial=createGameState();
  for(const furniture of [
    [{id:"desk",x:0.75,z:-10.5,rotation:0},...initial.bedroomFurniture!.slice(1)],
    [initial.bedroomFurniture![0],initial.bedroomFurniture![0],
      initial.bedroomFurniture![2]],
    [initial.bedroomFurniture![0],initial.bedroomFurniture![1],
      {...initial.bedroomFurniture![2],extra:1}],
  ]){
    const corrupted={...initial,bedroomFurniture:furniture};
    assert.throws(()=>createSave(corrupted as any),/bedroomFurniture/);
  }
});
