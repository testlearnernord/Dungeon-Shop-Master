import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {furnitureDefinition} from "../../src/game/furnitureRegistry.ts";

test("Galvik's beloved is fixed to the secret cellar entrance, not movable",()=>{
  const store=new GameStore(createGameState());
  assert.equal(furnitureDefinition("galvik-portrait").mount,"shop-wall");
  assert.equal(store.state.wallPortrait,undefined);
  const draft={id:"galvik-portrait" as const,x:4,z:-6.45,rotation:2 as const};
  assert.match(store.previewFurniturePlacement(draft)??"",/fixed secret passage/);
  assert.match(store.placeFurniture(draft),/fixed secret passage/);
  assert.equal(store.state.wallPortrait,undefined);
  assert.equal(store.state.cellarDoorOpen,false);
  store.toggleCellarDoor();
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(saved.wallPortrait,undefined);
  assert.equal(saved.cellarDoorOpen,true);
});

test("strict saves reject invalid passage state",()=>{
  const save=createSave(createGameState()),bad=structuredClone(save);
  (bad.payload as any).cellarDoorOpen="yes";
  assert.throws(()=>parseSave(JSON.stringify(bad)),/cellarDoorOpen/);
});
