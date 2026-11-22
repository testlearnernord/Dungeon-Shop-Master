import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {liveHeroCard} from "../../src/game/heroCardView.ts";

test("Alpha v32 has an unnumbered shop, while real numbered Dungeon Floor 5 remains valid",()=>{
  const state=createGameState(7351);
  assert.equal(SIMULATION_VERSION,32);
  const visitors=state.adventurers.filter(h=>h.status==="at-shop");
  assert(visitors.length>0);
  assert(visitors.every(h=>h.floor==="shop"));
  const visitor=visitors[0];
  assert.equal(liveHeroCard(state,visitor.id)?.floor,null,
    "No Hero Card may advertise Galvik's shop as numbered dungeon Floor 5");
  const adventurer={...visitor,status:"exploring" as const,floor:5 as const,
    shopStayDays:0};
  const exploring={...state,adventurers:state.adventurers.map(h=>
    h.id===visitor.id?adventurer:h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(exploring))),exploring);
  assert.equal(liveHeroCard(exploring,visitor.id)?.floor,5);
});

test("Alpha v32 rejects old fake shop-floor saves and v31 without migration",()=>{
  const state=createGameState(7351),visitor=state.adventurers.find(
    h=>h.status==="at-shop")!;
  const current=structuredClone(createSave(state)) as any;
  const old=structuredClone(current);
  old.simulationVersion=31;
  old.payload.simulationVersion=31;
  old.payload.adventurers.find((h:any)=>h.id===visitor.id).floor=5;
  assert.throws(()=>parseSave(JSON.stringify(old)),
    /simulationVersion.*incompatible.*New Game/i);
  const forged=structuredClone(current);
  forged.payload.adventurers.find((h:any)=>h.id===visitor.id).floor=5;
  assert.throws(()=>parseSave(JSON.stringify(forged)),/floor.*agree with status/i);
  const misplaced=structuredClone(current);
  misplaced.payload.adventurers.find((h:any)=>h.id===visitor.id).floor="away";
  assert.throws(()=>parseSave(JSON.stringify(misplaced)),/floor.*agree with status/i);
});

test("off-duty heroes occupy neither Galvik's shop nor any real numbered floor",()=>{
  const state=createGameState(7351),visitor=state.adventurers.find(
    h=>h.status==="at-shop")!;
  const away={...state,adventurers:state.adventurers.map(h=>h.id===visitor.id
    ?{...h,status:"off-duty" as const,floor:"away" as const,
      shopStayDays:0,offDutyUntilDay:state.day+2}
    :h)};
  assert.deepEqual(parseSave(JSON.stringify(createSave(away))),away);
  assert.equal(liveHeroCard(away,visitor.id)?.floor,null);
  const old=structuredClone(createSave(away)) as any;
  old.payload.adventurers.find((h:any)=>h.id===visitor.id).floor=5;
  assert.throws(()=>parseSave(JSON.stringify(old)),/floor.*agree with status/i);
});