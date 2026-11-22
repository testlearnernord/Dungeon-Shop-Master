import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION}
  from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {createBlueprintPreviewValidator}
  from "../../src/game/blueprintPreviewValidator.ts";
import {shopLayoutProblem} from "../../src/game/shopLayout.ts";
import {shopPortalTravelLane,overlapsShopPortalClearance}
  from "../../src/game/shopPortal.ts";

test("shelf and register cannot occupy portal or sealed-gate clearance in preview or commit",()=>{
  const store=new GameStore(createGameState(7351));
  const before=structuredClone(store.state);
  const validator=createBlueprintPreviewValidator(d=>
    store.previewFurniturePlacement(d));
  const invalid=[
    {id:"shelf-1" as const,x:-4,z:4.5,rotation:0 as const},
    {id:"shelf-1" as const,x:4,z:4.5,rotation:0 as const},
    {id:"counter" as const,x:-4,z:4.5,rotation:0 as const},
    {id:"counter" as const,x:4,z:4.5,rotation:0 as const},
  ];
  for(const draft of invalid){
    const preview=store.previewFurniturePlacement(draft);
    assert.match(preview??"",/entrances|aisles|clear/i);
    const check=validator.evaluate(draft,store.state.shopLayout,
      store.state.shopRoom,1000,true);
    assert.equal(check.ready,true);
    assert.equal(check.problem,preview,
      "The ghost and the actual placement must reject the exact same bounds");
    assert.equal(store.placeFurniture(draft),preview);
    assert.deepEqual(store.state,before);
  }
  assert.equal(shopLayoutProblem(store.state.shopLayout,store.state.shopRoom),null);
});
test("the only portal lanes stay unbuildable, while a normal shop site stays valid",()=>{
  for(const phase of ["entering","leaving"] as const){
    const x=shopPortalTravelLane(phase);
    assert(overlapsShopPortalClearance({minX:x-.35,maxX:x+.35,minZ:5,maxZ:6}));
  }
  assert.equal(overlapsShopPortalClearance(
    {minX:-1,maxX:1,minZ:-2,maxZ:-1}),false);
});
test("v33 save rejects old two-door traffic state without importing a legacy path",()=>{
  const state=createGameState(4321);
  assert.equal(SIMULATION_VERSION,34);
  const saved=createSave(state);
  assert.deepEqual(parseSave(JSON.stringify(saved)),state);
  const old=structuredClone(saved) as any;
  old.simulationVersion=27;
  old.payload.simulationVersion=27;
  assert.throws(()=>parseSave(JSON.stringify(old)),
    /simulationVersion.*incompatible/);
  const forged=structuredClone(saved) as any;
  forged.payload.shopTraffic.doorY={level4:0,level6:0};
  assert.throws(()=>parseSave(JSON.stringify(forged)),
    /shopTraffic.*doorY/);
});
