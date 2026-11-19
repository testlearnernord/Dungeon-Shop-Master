import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {selectExpeditionArchive,archiveWorldTime,archiveForHero}
  from "../../src/game/expeditionArchive.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptyLevel7World} from "../../src/game/level7Exploration.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("archive indexes only real committed events, with explicit unknown clock time",()=>{
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  const start=selectExpeditionArchive(store.state);
  const snapshot=structuredClone(store.state);
  assert.deepEqual(store.state,snapshot);
  assert(start.every(entry=>!entry.hasReplay||entry.replaySeconds!==null));
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const indexed=selectExpeditionArchive(store.state);
  const ids=new Set(indexed.map(e=>e.id));
  assert.equal(ids.size,indexed.length);
  assert(indexed.every(entry=>Number.isInteger(entry.day)&&
    (entry.worldTick===null||entry.worldTick<=store.state.worldClock.tick)));
  assert.equal(archiveWorldTime(1,null),"Day 1 · time unrecorded");
  assert.equal(archiveWorldTime(2,28800+1200),"Day 2 · 01:00");
  assert.deepEqual(selectExpeditionArchive(store.state),indexed);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("true live encounter becomes seekable archive footage without a second resolver",()=>{
  const initial=createGameState(7351),layout=generateExpeditionLayout(7351,1);
  const monster=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0)!;
  const adjacent=dungeonNeighbors(layout,monster)[0];
  const index=monster.z*layout.width+monster.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile!=="wall"&&i!==index?[i]:[]);
  const hero=initial.adventurers.find(h=>h.status==="exploring"&&h.floor===1)!;
  const store=new GameStore({...initial,earlyDungeonWorlds:[{
    floor:1 as const,world:{...emptyLevel7World(),heroes:[{
      heroId:hero.id,...adjacent,visited,
    }]},
  }]});
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.combats.length>0);
  let guard=0;
  while(store.state.liveDungeon.combats.length&&guard++<100)
    store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  assert(guard<100,"Encounter needs a finite recorded end");
  const recording=store.state.events.find(e=>e.type==="dungeon-live"&&
    e.adventurerId===hero.id&&e.dungeonReplay?.encounters.length);
  assert(recording,"Authoritative motor must commit actual battle footage");
  const before=structuredClone(store.state);
  const library=selectExpeditionArchive(store.state);
  const indexed=library.find(entry=>entry.id===recording.id)!;
  assert(indexed.hasReplay);
  assert(indexed.replaySeconds!==null&&indexed.replaySeconds>0);
  assert(indexed.bookmarks.some(b=>b.label==="Combat"));
  const combatBookmark=indexed.bookmarks.find(b=>b.label==="Combat")!;
  assert(combatBookmark.replaySeconds>=0);
  assert.equal(indexed.worldTick,recording.worldTick);
  assert.equal(indexed.heroId,hero.id);
  assert.deepEqual(store.state,before,"Archive navigation must never change outcomes");
  assert.deepEqual(selectExpeditionArchive(
    parseSave(JSON.stringify(createSave(store.state)))),library);
  assert(archiveForHero(library,hero.id).some(entry=>entry.id===indexed.id));
});

test("archive headers remain sealed and do not derive remote HP or loot",()=>{
  const initial=createGameState(7351);
  const store=new GameStore(initial);store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const first=selectExpeditionArchive(store.state);
  const remote=store.state.adventurers.find(h=>h.status==="exploring")!;
  const changed={...store.state,adventurers:store.state.adventurers.map(h=>
    h.id===remote.id?{...h,health:1,gold:99999,inventory:{
      ...h.inventory,loot:500,
    }}:h)};
  const second=selectExpeditionArchive(changed);
  assert.deepEqual(second,first);
  assert(second.every(e=>!/(victory|loot|[0-9]+ HP)/i.test(e.label)));
});
