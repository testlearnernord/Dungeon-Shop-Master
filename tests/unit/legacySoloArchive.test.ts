import assert from "node:assert/strict";
import test from "node:test";
import {advanceDay,createGameState,setBossPass,type WorldEvent}
  from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {selectExpeditionArchive,archiveBookmarks}
  from "../../src/game/expeditionArchive.ts";

test("legacy non-LIVE solo boss events retain truthful historical archive access",()=>{
  let state=createGameState();
  const shopper=state.adventurers.find(h=>h.status==="at-shop")!;
  state=setBossPass(state,shopper.id,true);
  state=advanceDay(state).state;
  assert.equal(state.events.filter(e=>e.type==="level6-combat").length,0);
  state=advanceDay(state).state;
  const combat=state.events.find(e=>e.type==="level6-combat"&&
    e.adventurerId===shopper.id)!;
  assert(combat?.combatReplay,"A genuine legacy combat record exists");
  const archive=selectExpeditionArchive(state,state.day);
  const recorded=archive.find(entry=>entry.id===combat.id)!;
  assert.equal(recorded.kind,"combat");
  assert.equal(recorded.floor,6,"Historical solo recording metadata is not rewritten to Floor 10");
  assert.equal(recorded.partyBoss,false);
  assert.equal(recorded.hasReplay,true);
  assert.deepEqual(archiveBookmarks(state,combat.id),
    [{id:"start",label:"Watch saved combat",replaySeconds:0}]);
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
});

test("legacy daily simulation still generates save-safe histories without old HUD",()=>{
  let state=createGameState();
  for(let day=0;day<130;day++){
    for(const hero of state.adventurers.filter(h=>h.status==="at-shop"))
      state=setBossPass(state,hero.id,true);
    state=advanceDay(state).state;
    const combatEvents=state.events.filter(e=>e.type==="level6-combat");
    assert(combatEvents.every(e=>
      ["victory","retreat","death"].includes(e.combatOutcome??"")),
      "An old solver still commits only resolved outcomes");
    assert(selectExpeditionArchive(state,state.day).length<=
      state.events.filter(e=>e.day===state.day).length);
  }
  const live=new Set(state.adventurers.filter(h=>h.status!=="dead").map(h=>h.id));
  for(const floor of state.earlyDungeonWorlds??[])
    assert(floor.world.heroes.every(h=>live.has(h.heroId)));
  assert(state.level7World.heroes.every(h=>live.has(h.heroId)));
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
});
