import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {activateLiveDungeon} from "../../src/game/liveDungeonRuntime.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("real Floor-7 ordinary explorer retains a LIVE descent intention through strict Save/Load",()=>{
  const base=activateLiveDungeon(createGameState(7351));
  const lead=base.adventurers[0];
  assert(lead&&lead.health>0);
  const state={
    ...base,
    adventurers:base.adventurers.map(hero=>hero.id===lead.id?
      {...hero,status:"exploring" as const,floor:7 as const}:hero),
    liveDungeon:{...base.liveDungeon,plans:[{
      heroId:lead.id,floor:7 as const,goal:"progress" as const,
      action:"descend" as const,updatedTick:base.worldClock.tick,
    }]},
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state,
    "Floor 7 is an ordinary map now, so a real exploring hero must be saveable");
});
