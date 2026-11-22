import assert from "node:assert/strict";
import test from "node:test";
import {advanceDay,createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {liveHeroCard} from "../../src/game/heroCardView.ts";

test("Alpha v33 distinguishes real Dungeon Floor 4 from unnumbered transit",()=>{
  const start=createGameState(7351);
  assert.equal(SIMULATION_VERSION,36);
  const visitor=start.adventurers.find(hero=>hero.status==="at-shop")!;
  const genuine={...visitor,status:"exploring" as const,floor:4 as const,
    shopStayDays:0};
  const dungeon={...start,adventurers:start.adventurers.map(h=>h.id===visitor.id
    ?genuine:h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(dungeon))),dungeon);
  assert.equal(liveHeroCard(dungeon,visitor.id)?.floor,4);
  const crossing={...visitor,status:"returning" as const,floor:"transit" as const,
    shopStayDays:0,lastDungeonFloor:4 as const};
  const inTransit={...start,adventurers:start.adventurers.map(h=>
    h.id===visitor.id?crossing:h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(inTransit))),inTransit);
  assert.equal(liveHeroCard(inTransit,visitor.id)?.floor,null,
    "A traveler never appears to explore the real Dungeon Floor 4.");
});

test("strict v33 rejects fake numeric transit and old Alpha v32 without migration",()=>{
  const start=createGameState(7351),id=start.adventurers[0].id;
  const saved=structuredClone(createSave(start)) as any;
  const old=structuredClone(saved);
  old.simulationVersion=32;
  old.payload.simulationVersion=32;
  old.payload.adventurers.find((h:any)=>h.id===id).status="returning";
  old.payload.adventurers.find((h:any)=>h.id===id).floor=4;
  assert.throws(()=>parseSave(JSON.stringify(old)),
    /simulationVersion.*incompatible.*New Game/i);
  for(const status of ["returning","traveling"]){
    const forged=structuredClone(saved);
    const hero=forged.payload.adventurers.find((h:any)=>h.id===id);
    hero.status=status;
    hero.floor=4;
    hero.shopStayDays=0;
    assert.throws(()=>parseSave(JSON.stringify(forged)),/floor.*agree with status/i);
  }
  const inconsistent=structuredClone(saved);
  inconsistent.payload.adventurers.find((h:any)=>h.id===id).floor="transit";
  assert.throws(()=>parseSave(JSON.stringify(inconsistent)),/floor.*agree with status/i,
    "A shop visitor cannot occupy an abstract portal transit.");
});

test("LIVE off-duty reentry resumes the last real depth, never a fake Floor 4",()=>{
  const initial=createGameState(7351);
  const hero=initial.adventurers.find(h=>h.status==="at-shop")!;
  const away={...hero,status:"off-duty" as const,floor:"away" as const,
    lastDungeonFloor:3 as const,offDutyUntilDay:3,shopStayDays:0};
  const state={...initial,adventurers:initial.adventurers.map(h=>
    h.id===hero.id?away:h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const day2=advanceDay(state).state;
  const resting=day2.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(resting.status,"off-duty");
  assert.equal(resting.floor,"away");
  assert.deepEqual(parseSave(JSON.stringify(createSave(day2))),day2);
  const day3=advanceDay(day2).state;
  const resumed=day3.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(resumed.floor,3,
    "Remembered dungeon depth is a real seeded floor, not shop transit");
  assert.equal(resumed.status,"exploring");
  assert(day3.events.some(e=>e.adventurerId===hero.id&&
    e.day===3&&e.type==="dungeon-live"),
    "A real clock event records the renewed expedition");
  assert(!day3.events.some(e=>e.adventurerId===hero.id&&e.day===3&&
    e.type==="sale"),"Reentry cannot invent merchant revenue");
  assert.deepEqual(parseSave(JSON.stringify(createSave(day3))),day3);
});
