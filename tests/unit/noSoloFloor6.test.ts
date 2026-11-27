import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("Floor 6 remains an ordinary seeded LIVE dungeon, never a solo Cave Troll",()=>{
  const base=createGameState(7351);
  const id=base.adventurers[0].id;
  const store=new GameStore({...base,adventurers:base.adventurers.map(hero=>
    hero.id===id?{...hero,status:"exploring" as const,
      floor:6 as const}:hero)});
  store.enableLiveDungeon();
  assert.equal(SIMULATION_VERSION,51);
  assert.equal("bossCombat" in store.state.liveDungeon,false);
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal("bossCombat" in store.state.liveDungeon,false,
    "A valid Floor-6 explorer cannot silently spawn the old solo boss");
  assert.equal(store.state.events.some(event=>event.type==="level6-combat"),false);
  assert.equal(store.state.dungeonFloors.some(f=>f.floor===6&&f.cleared),false,
    "No solo-boss victory can incorrectly clear an ordinary floor");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("v35 strictly rejects a forged LIVE solo-boss checkpoint, no fallback or migration",()=>{
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  const save=structuredClone(createSave(store.state)) as any;
  save.payload.liveDungeon.bossCombat={id:"live-boss:1:200:forged",heroId:"adventurer-1"};
  assert.throws(()=>parseSave(JSON.stringify(save)),/liveDungeon\.bossCombat.*not supported/);
  const old=structuredClone(createSave(store.state)) as any;
  old.simulationVersion=32;
  old.payload.simulationVersion=32;
  assert.throws(()=>parseSave(JSON.stringify(old)),
    /simulationVersion.*incompatible.*New Game/);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("v35 rejects an injected old expedition Floor-6 hero in the LIVE motor",()=>{
  const initial=createGameState(7351);
  const id=initial.adventurers[0].id;
  const store=new GameStore({...initial,adventurers:initial.adventurers.map(h=>
    h.id===id?{...h,floor:6 as const,status:"expedition" as const}:h)});
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal("bossCombat" in store.state.liveDungeon,false);
  assert.throws(()=>createSave(store.state),
    /Only Floor 10 supports boss expeditions/);
});
