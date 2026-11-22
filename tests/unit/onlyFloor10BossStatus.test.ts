import assert from "node:assert/strict";
import test from "node:test";
import {advanceDay,createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

test("current Alpha rejects obsolete Floor-7 solo expedition state",()=>{
  const baseline=createGameState(7351);
  const canonical=parseSave(JSON.stringify(createSave(baseline)));
  assert.deepEqual(canonical,baseline);
  const id=baseline.adventurers[0].id;
  const forged=structuredClone(createSave(baseline)) as any;
  const hero=forged.payload.adventurers.find((h:{id:string})=>h.id===id)!;
  hero.floor=7;
  hero.status="expedition";
  hero.bossPass=true;
  assert.throws(()=>parseSave(JSON.stringify(forged)),
    /Only Floor 10 supports boss expeditions/);
  const invalid={...baseline,adventurers:baseline.adventurers.map(h=>h.id===id
    ?{...h,floor:7 as const,status:"expedition" as const,bossPass:true}:h)};
  assert.throws(()=>advanceDay(invalid),
    /Only Floor 10 supports boss expedition status/);
});

test("Floor 6 cannot revive a solo boss when the LIVE flag is absent",()=>{
  const baseline=createGameState(7351);
  const forged=structuredClone(createSave(baseline)) as any;
  forged.payload.liveDungeon.enabled=false;
  forged.payload.adventurers[0].floor=6;
  forged.payload.adventurers[0].status="expedition";
  forged.payload.adventurers[0].bossPass=true;
  assert.throws(()=>parseSave(JSON.stringify(forged)),
    /Only Floor 10 supports boss expeditions/);
});
