import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("Alpha v30 strictly rejects all retired solo Troll and old departure events",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  for(const type of ["level6-departure","level6-combat",
    "level6-return","level7-departure"]){
    const file=structuredClone(createSave(state)) as any;
    file.payload.events.push({
      id:"day-1:"+hero.id+":"+type,type,day:1,
      adventurerId:hero.id,message:"obsolete legacy event",
    });
    assert.throws(()=>parseSave(JSON.stringify(file)),/payload.events.*type/,
      type+" must never be accepted into a current save");
  }
  for(const key of ["combatReplay","combatOutcome"]){
    const file=structuredClone(createSave(state)) as any;
    file.payload.events[0][key]=key==="combatReplay"?{version:1}:"victory";
    assert.throws(()=>parseSave(JSON.stringify(file)),/payload.events/,
      "orphaned Solo-F6 metadata must not be admitted");
  }
});

test("real ordinary Floor-6 exploration and group boss save shape remain canonical",()=>{
  const initial=createGameState(7351),hero=initial.adventurers[0];
  const explorer={...hero,status:"exploring" as const,floor:6 as const};
  const next=advanceDay({...initial,
    adventurers:initial.adventurers.map(h=>h.id===hero.id?explorer:h)}).state;
  assert(next.events.some(e=>e.type==="dungeon-live"&&
    e.adventurerId===hero.id),
    "A real Floor-6 hero must report scheduled live activity");
  assert.deepEqual(parseSave(JSON.stringify(createSave(next))),next);
});
