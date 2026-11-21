import assert from "node:assert/strict";
import test from "node:test";
import {FISHING_FLICKS,scoreFishingFlick,REQUIRED_FLICKS,
  fishingDirectionFor} from "../../src/game/fishingSkill.ts";
import {createCellarRoom} from "../../src/game/cellarRoom.ts";
import {POND_CELLS,isCellarPondUncovered,pondExcavationRemaining} from
  "../../src/game/cellarPond.ts";
import {excavateLevel5Cell} from "../../src/game/level5Room.ts";

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
