import assert from "node:assert/strict";
import test from "node:test";
import {FISHING_FLICKS,scoreFishingFlick,REQUIRED_FLICKS,
  fishingDirectionFor} from "../../src/game/fishingSkill.ts";
import {createCellarRoom} from "../../src/game/cellarRoom.ts";
import {POND_CELLS,isCellarPondUncovered,pondExcavationRemaining} from
  "../../src/game/cellarPond.ts";
import {excavateLevel5Cell} from "../../src/game/level5Room.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("the basin is revealed by the EXISTING connected six-cell excavation",()=>{
  let room=createCellarRoom();
  assert.equal(pondExcavationRemaining(room),6);
  assert.equal(isCellarPondUncovered(room),false);
  for(const cell of POND_CELLS){
    const cut=excavateLevel5Cell(room,cell);
    assert.equal(cut.ok,true,JSON.stringify(cell));
    if(cut.ok)room=cut.room;
  }
  assert.equal(pondExcavationRemaining(room),0);
  assert.equal(isCellarPondUncovered(room),true);
});

test("flicks require movement direction, sufficient travel and speed",()=>{
  assert.equal(scoreFishingFlick(-75,0,95,{x:-1,y:0}),"perfect");
  assert.equal(scoreFishingFlick(-45,0,195,{x:-1,y:0}),"good");
  assert.equal(scoreFishingFlick(80,0,95,{x:-1,y:0}),"miss");
  assert.equal(scoreFishingFlick(-9,0,60,{x:-1,y:0}),"too-small");
  assert.equal(scoreFishingFlick(-100,0,300,{x:-1,y:0}),"too-slow");
  assert.equal(scoreFishingFlick(90,-90,140,{x:1,y:-1}),"perfect");
  assert.equal(FISHING_FLICKS.length,8);
  assert.equal(REQUIRED_FLICKS,3);
  assert.deepEqual(fishingDirectionFor(0,0),fishingDirectionFor(0,0));
});

test("only a fully excavated pool can award durable catch records",()=>{
  const {state:initial,store}=(()=>{const state=createGameState();
    return {state,store:new GameStore(state)};})();
  assert.equal(store.recordCellarCatch(),"Excavate the pond first.");
  assert.strictEqual(store.state,initial);
  for(const cell of POND_CELLS){
    const msg=store.excavateCellarCell(cell);
    assert.match(msg,/Cellar rock excavated|underground pond|Damp rock/);
  }
  assert.equal(store.recordCellarCatch(),"Cave fish caught! Total: 1.");
  assert.equal(store.state.cellarFishCaught,1);
  assert.equal(store.state.worldClock.tick,initial.worldClock.tick);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.equal(saved.cellarFishCaught,1);
  const corrupt=createSave(store.state);
  (corrupt.payload as any).cellarFishCaught=-1;
  assert.throws(()=>parseSave(JSON.stringify(corrupt)),/cellarFishCaught/);
});
