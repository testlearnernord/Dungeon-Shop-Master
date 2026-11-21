import test from "node:test";
import assert from "node:assert/strict";
import {createGameState,type WorldEvent} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {selectExpeditionArchive,archiveAvailableDays,archiveWorldTime,
  archiveBookmarks} from "../../src/game/expeditionArchive.ts";
import {compactReplayFootage,MAX_SAVED_REPLAYS}
  from "../../src/game/replayRetention.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptyLevel7World} from "../../src/game/level7Exploration.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("timeline is limited to current plus two previous days; precise event times stay separate",()=>{
  assert.deepEqual(archiveAvailableDays(1),[1]);
  assert.deepEqual(archiveAvailableDays(2),[2,1]);
  assert.deepEqual(archiveAvailableDays(9),[9,8,7]);
  assert.equal(archiveWorldTime(2,null),"Day 2 · time unrecorded");
  assert.equal(archiveWorldTime(2,28800+1200),"Day 2 · 01:00");

  const initial=createGameState(7351);
  const hero=initial.adventurers[0];
  const events:WorldEvent[]=[
    {id:"day-5:"+hero.id+":temporary-party-join",type:"temporary-party-join",
      day:5,adventurerId:hero.id,message:"Party joined"},
    {id:"day-8:"+hero.id+":dungeon-live:202000",type:"dungeon-live",
      day:8,worldTick:202000,reportedZone:"upper",dungeonHighlight:"treasure",
      adventurerId:hero.id,message:"Expedition changed"},
    {id:"day-9:"+hero.id+":temporary-party-leave",type:"temporary-party-leave",
      day:9,adventurerId:hero.id,message:"Party split"},
  ];
  const state={...initial,day:9,events,savedReplayIds:[]};
  const today=selectExpeditionArchive(state);
  assert.equal(today.length,1);
  assert.equal(today[0].kind,"party");
  assert.equal(selectExpeditionArchive(state,8)[0].kind,"treasure");
  assert.equal(selectExpeditionArchive(state,5).length,1,
    "Expired day filter must fall back to current day");
  assert.equal(selectExpeditionArchive(state,"saved").length,0);
  assert.equal(selectExpeditionArchive(state,7).length,0);
});

test("old full frames expire only if not deliberately pinned; event facts remain",()=>{
  const a:WorldEvent={id:"day-1:adventurer-1:dungeon-exploration",
    type:"dungeon-exploration",day:1,adventurerId:"adventurer-1",
    message:"Recorded",dungeonReplay:{version:1,day:1,heroId:"adventurer-1",
      floor:1,appearance:{role:"tank",equipment:{weapon:null,armor:null}},
      steps:[{x:1,z:1,t:0,action:"enter",hp:20}],encounters:[],
      outcome:"exploring"}};
  const b:WorldEvent={id:"day-2:adventurer-1:hero-death-signal:30000",
    type:"hero-death-signal",day:2,adventurerId:"adventurer-1",
    worldTick:30000,message:"Signature extinguished"};
  const unpinned=compactReplayFootage([a,b],4,[]);
  assert.equal(unpinned[0].dungeonReplay,undefined);
  assert.deepEqual(unpinned[1],b);
  assert.equal(unpinned[0].id,a.id);
  const pinned=compactReplayFootage([a,b],4,[a.id]);
  assert.deepEqual(pinned[0],a);
  assert.deepEqual(compactReplayFootage(pinned,5,[])[0].dungeonReplay,undefined);
});

test("real saved 60Hz fight can be pinned, bookmarked and reloaded without changing gameplay",()=>{
  const initial=createGameState(7351),layout=generateExpeditionLayout(7351,1);
  const monster=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0)!;
  const approach=dungeonNeighbors(layout,monster)[0];
  const index=monster.z*layout.width+monster.x;
  const visited=layout.tiles.flatMap((cell,i)=>cell!=="wall"&&i!==index?[i]:[]);
  const hero=initial.adventurers.find(h=>h.status==="exploring"&&h.floor===1)!;
  const store=new GameStore({...initial,earlyDungeonWorlds:[{
    floor:1 as const,world:{...emptyLevel7World(),heroes:[{
      heroId:hero.id,...approach,visited,
    }]},
  }]});
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  let count=0;
  while(store.state.liveDungeon.combats.length&&count++<100)
    store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  assert(count<100,"Real encounter must terminate");
  const event=store.state.events.find(e=>e.type==="dungeon-live"&&
    e.adventurerId===hero.id&&e.dungeonReplay?.encounters.length);
  assert(event,"Real motor must commit battle frames");
  const original=structuredClone(store.state);
  const timeline=selectExpeditionArchive(store.state);
  assert(timeline.some(entry=>entry.id===event.id&&entry.hasReplay));
  assert(archiveBookmarks(store.state,event.id).some(b=>b.label==="Combat"));
  assert.deepEqual(store.state,original,"Reading footage must not mutate world");
  assert.match(store.toggleSavedReplay(event.id),/saved/i);
  assert.deepEqual(store.state.savedReplayIds,[event.id]);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  assert.equal(selectExpeditionArchive(store.state,"saved").length,1);
  assert.deepEqual(compactReplayFootage(store.state.events,5,store.state.savedReplayIds)
    .find(e=>e.id===event.id)?.dungeonReplay,event.dungeonReplay);
  assert.match(store.toggleSavedReplay(event.id),/removed/i);
  assert.deepEqual(store.state.savedReplayIds,[]);
});

test("saving is bounded and unavailable or invented records cannot be pinned",()=>{
  const store=new GameStore(createGameState(7351));
  assert.equal(MAX_SAVED_REPLAYS,12);
  assert.match(store.toggleSavedReplay("made-up-id"),/No recording/);
  assert.equal(store.state.savedReplayIds.length,0);
  const save=createSave(store.state) as any;
  save.payload.savedReplayIds=["forged"];
  assert.throws(()=>parseSave(JSON.stringify(save)),/savedReplayIds/);
});

test("current Expedition Archive never projects hidden fight outcome text or secret resources",()=>{
  const original=createGameState(7351);
  const hero=original.adventurers[0];
  const event:WorldEvent={
    id:"day-1:"+hero.id+":level6-combat",day:1,type:"level6-combat",
    adventurerId:hero.id,message:"SECRET: 999 gold, death, hidden rare loot",
    combatOutcome:"death",combatReplay:{} as NonNullable<WorldEvent["combatReplay"]>,
  };
  const baseline={...original,events:[event]};
  const visible=selectExpeditionArchive(baseline);
  assert.equal(visible.length,1);
  assert.equal(visible[0].kind,"combat");
  assert.equal(visible[0].label,"Recorded expedition");
  assert.equal(visible[0].hasReplay,true);
  assert.equal(visible[0].heroId,hero.id);
  const hiddenChange={...baseline,
    adventurers:original.adventurers.map(h=>h.id===hero.id?{
      ...h,health:0,status:"dead" as const,level:99,xp:99999,gold:999999,
      inventory:{...h.inventory,loot:9999},
    }:h),
    events:[{...event,message:"VICTORY: 3000 gold, secret chamber",
      combatOutcome:"victory" as const,
      combatReplay:{superSecret:"do not reveal"} as unknown as NonNullable<WorldEvent["combatReplay"]>}],
  };
  assert.deepEqual(selectExpeditionArchive(hiddenChange),visible,
    "A list entry must not reveal the new combat outcome, loot, HP, XP or gold");
  assert(!/SECRET|VICTORY|999|death|secret chamber/i.test(JSON.stringify(visible)));
  const unchanged=structuredClone(hiddenChange);
  selectExpeditionArchive(hiddenChange);
  assert.deepEqual(hiddenChange,unchanged,"Archive projection must not write gameplay");
});
