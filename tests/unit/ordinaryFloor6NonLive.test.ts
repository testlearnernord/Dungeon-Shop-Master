import assert from "node:assert/strict";
import test from "node:test";
import {advanceDay,createGameState,setBossPass} from "../../src/game/gameState.ts";

test("legacy day closure never creates a solo Floor-6 Troll or a pass-driven shortcut",()=>{
  const start=createGameState(7351);
  const shopper=start.adventurers[0];
  const permitted=setBossPass(start,shopper.id,true);
  const next=advanceDay(permitted);
  const hero=next.state.adventurers.find(h=>h.id===shopper.id)!;
  assert.equal(hero.bossPass,true);
  assert.notEqual(hero.status,"expedition");
  assert(!next.events.some(e=>e.type==="level6-combat"||
    e.type==="level6-departure"||e.type==="level7-departure"));
  assert(!next.state.dungeonFloors.some(e=>e.floor===6&&e.cleared));
  assert.deepEqual(advanceDay(permitted),next);
});

test("Floor 6 uses the real LIVE scheduler, never a parallel daily solver",()=>{
  const start=createGameState(7351);
  const shopper=start.adventurers[0];
  const explorer={...shopper,status:"exploring" as const,floor:6 as const};
  const state={...start,adventurers:start.adventurers.map(h=>h.id===shopper.id?explorer:h)};
  const result=advanceDay(state);
  assert(result.events.some(e=>e.adventurerId===shopper.id&&
    e.type==="dungeon-live"),
    "A genuine numbered Floor 6 must produce live expedition activity");
  assert(result.state.dungeonWorlds.some(entry=>entry.floor===6));
  assert(!result.events.some(e=>e.type==="level6-combat"));
});

test("forged historical solo Floor-6 expedition cannot be silently reinterpreted",()=>{
  const state=createGameState();
  const hero=state.adventurers[0];
  const forged={...state,adventurers:state.adventurers.map(h=>h.id===hero.id
    ?{...hero,status:"expedition" as const,floor:6 as const}:h)};
  assert.throws(()=>advanceDay(forged),/Floor 6.*solo boss expedition/);
});
