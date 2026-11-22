import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {selectLiveSpectatorFrame} from "../../src/game/liveSpectator.ts";
import {selectLiveBoardHeroes} from "../../src/game/liveBoardProjection.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("LIVE spectator is explicit, read-only, fogged and reproducible after reload",()=>{
  const store=new GameStore(createGameState(7351));
  const remote=store.state.adventurers.find(h=>h.status==="exploring"&&h.floor===1)!;
  assert.equal(selectLiveSpectatorFrame(store.state,remote.id),null);
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const before=structuredClone(store.state);
  const view=selectLiveSpectatorFrame(store.state,remote.id);
  assert(view);
  assert.equal(view.worldTick,before.worldClock.tick);
  assert.equal(view.floor,1);
  assert(view.visited.includes(view.z*generateExpeditionLayout(7351,1).width+view.x));
  assert.equal(store.state.worldClock.tick,before.worldClock.tick);
  assert.deepEqual(store.state,before,"Observing must never commit a gameplay mutation");
  const board=selectLiveBoardHeroes(store.state).find(h=>h.id===remote.id)!;
  assert.equal(board.visible,null);
  assert(!("combat" in board),"Ordinary board must not inherit spectator knowledge");
  const copy=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(selectLiveSpectatorFrame(copy,remote.id),view);
});

test("LIVE combat observation displays only committed frames, never a synthetic result",()=>{
  const initial=createGameState(7351);
  const layout=generateExpeditionLayout(7351,1);
  const monster=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0)!;
  const approach=dungeonNeighbors(layout,monster)[0];
  const monsterIndex=monster.z*layout.width+monster.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile!=="wall"&&i!==monsterIndex?[i]:[]);
  const hero=initial.adventurers.find(h=>h.floor===1&&h.status==="exploring")!;
  const store=new GameStore({...initial,dungeonWorlds:[{
    floor:1 as const,world:{...emptySpatialDungeonWorld(),heroes:[{
      heroId:hero.id,...approach,visited,
    }]},
  }]});
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const before=store.state.liveDungeon.combats[0];
  assert(before);
  const first=selectLiveSpectatorFrame(store.state,hero.id);
  assert(first?.combat);
  assert.deepEqual(first.combat.frame,before.frames.at(-1));
  assert.equal(first.combat.frames.length,1);
  store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  const after=store.state.liveDungeon.combats[0];
  assert(after);
  const watched=selectLiveSpectatorFrame(store.state,hero.id);
  assert(watched?.combat);
  assert.deepEqual(watched.combat.frames,after.frames);
  assert.deepEqual(watched.combat.frame,after.frames.at(-1));
  assert.equal(watched.combat.id,before.id);
  assert.equal(store.state.worldClock.tick,
    DUNGEON_STEP_INTERVAL_TICKS+LIVE_COMBAT_INTERVAL_TICKS);
  assert.equal(selectLiveBoardHeroes(store.state).find(h=>h.id===hero.id)!.visible,null);
});

test("only a committed and spatially active hero can be watched",()=>{
  const state=createGameState(7351);
  const shop=state.adventurers.find(h=>h.status==="at-shop")!;
  assert.equal(selectLiveSpectatorFrame(state,shop.id),null);
  const store=new GameStore(state);store.enableLiveDungeon();
  assert.equal(selectLiveSpectatorFrame(store.state,shop.id),null);
  assert.equal(selectLiveSpectatorFrame(store.state,"unknown-id"),null);
  const remote=store.state.adventurers.find(h=>h.status==="exploring")!;
  const fake={...store.state,adventurers:store.state.adventurers.map(h=>
    h.id===remote.id?{...h,status:"dead" as const,health:0}:h)};
  assert.equal(selectLiveSpectatorFrame(fake,remote.id),null);
});
