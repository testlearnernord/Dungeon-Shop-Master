import assert from "node:assert/strict";
import test from "node:test";
import {FISHING_FLICKS,scoreFishingFlick,REQUIRED_FLICKS,
  FLICK_DISTANCE_BY_COUNTER,FLICK_SAMPLE_MS,fishingFlickDistanceFor,
  fishingFlickProgress,fishingDirectionFor} from "../../src/game/fishingSkill.ts";
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

test("three counters require increasing quick mouse sweeps, not tiny nudges",()=>{
  assert.deepEqual(FLICK_DISTANCE_BY_COUNTER,[120,165,210]);
  assert.equal(FLICK_SAMPLE_MS,400);
  assert.deepEqual([0,1,2,3,4].map(fishingFlickDistanceFor),
    [120,165,210,210,210]);
  for(let index=0;index<REQUIRED_FLICKS;index++){
    const distance=fishingFlickDistanceFor(index);
    assert.equal(scoreFishingFlick(distance-1,0,100,{x:1,y:0},distance),
      "too-small");
    assert.equal(scoreFishingFlick(distance+2,0,300,{x:1,y:0},distance),
      "good");
    assert.equal(scoreFishingFlick(distance*1.25,0,180,{x:1,y:0},distance),
      "perfect");
    assert.equal(scoreFishingFlick(-distance*1.3,0,180,{x:1,y:0},distance),
      "miss");
    assert.equal(scoreFishingFlick(distance*1.25,0,460,{x:1,y:0},distance),
      "too-slow");
  }
  assert.equal(scoreFishingFlick(190,-190,190,{x:1,y:-1},210),"perfect");
  assert.equal(FISHING_FLICKS.length,8);
  assert.equal(REQUIRED_FLICKS,3);
  assert.deepEqual(fishingDirectionFor(0,0),fishingDirectionFor(0,0));
});

test("visible pull progress measures forward movement, not side-to-side travel",()=>{
  assert.deepEqual(fishingFlickProgress(60,0,{x:1,y:0},120),
    {projected:60,ratio:.5});
  assert.deepEqual(fishingFlickProgress(0,400,{x:1,y:0},120),
    {projected:0,ratio:0});
  assert.deepEqual(fishingFlickProgress(-400,0,{x:1,y:0},120),
    {projected:0,ratio:0});
  assert.deepEqual(fishingFlickProgress(230,0,{x:1,y:0},210),
    {projected:230,ratio:1});
  const diagonal=fishingFlickProgress(100,100,{x:1,y:1},210);
  assert.ok(diagonal.ratio>.67&&diagonal.ratio<.68);
  assert.deepEqual(fishingFlickProgress(100,100,{x:0,y:0},210),
    {projected:0,ratio:0});
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
