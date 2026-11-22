import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {GameStore} from "../../src/game/gameStore.ts";

test("Alpha v31 stores one physical shopRoom, not a numbered Level-5 room key",()=>{
  const state=createGameState(7351);
  assert.equal(SIMULATION_VERSION,31);
  assert(state.shopRoom);
  assert.equal("level5Room" in state,false);
  const save=structuredClone(createSave(state)) as any;
  assert("shopRoom" in save.payload);
  assert.equal("level5Room" in save.payload,false);
  assert.deepEqual(parseSave(JSON.stringify(save)),state);
});

test("strict v31 rejects old v30 shop-room saves with no silent migration",()=>{
  const state=createGameState(7351);
  const old=structuredClone(createSave(state)) as any;
  old.simulationVersion=30;
  old.payload.simulationVersion=30;
  old.payload.level5Room=old.payload.shopRoom;
  delete old.payload.shopRoom;
  assert.throws(()=>parseSave(JSON.stringify(old)),
    /simulationVersion.*incompatible.*New Game/i);
  const forged=structuredClone(createSave(state)) as any;
  forged.payload.level5Room=forged.payload.shopRoom;
  delete forged.payload.shopRoom;
  assert.throws(()=>parseSave(JSON.stringify(forged)),
    /(?:unexpected|shopRoom)/i);
  const dual=structuredClone(createSave(state)) as any;
  dual.payload.level5Room=dual.payload.shopRoom;
  assert.throws(()=>parseSave(JSON.stringify(dual)),/(?:not supported|unexpected)/i,
    "No compatibility layer accepts a second legacy room field");
});

test("Shop mining and expansion still mutate the same saved shopRoom",()=>{
  const store=new GameStore(createGameState(7351));
  const before=store.state.shopRoom;
  const cellarBefore=structuredClone(store.state.cellarRoom);
  assert.equal(store.unlockShopExpansion(1),"Shop expansion unlocked.");
  assert.notStrictEqual(store.state.shopRoom,before);
  assert.equal(store.state.shopRoom.expansionTier,1);
  assert.deepEqual(store.state.cellarRoom,cellarBefore,
    "Shop expansion must not modify the independent cellar.");
  assert.equal("level5Room" in store.state,false);
  const reloaded=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(reloaded.shopRoom,store.state.shopRoom);
  assert.deepEqual(reloaded.cellarRoom,store.state.cellarRoom);
});