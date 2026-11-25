import test from "node:test";
import assert from "node:assert/strict";
import {createGameState,advanceDay,type WorldEvent} from "../../src/game/gameState.ts";
import {realSpatialTapeFixture} from "./realSpatialTapeFixture.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {selectExpeditionArchive,archiveAvailableDays,archiveWorldTime,
  archiveBookmarks,archiveRecordingDestination} from "../../src/game/expeditionArchive.ts";
import {compactReplayFootage,MAX_SAVED_REPLAYS}
  from "../../src/game/replayRetention.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
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
  const store=new GameStore({...initial,dungeonWorlds:[{
    floor:1 as const,world:{...emptySpatialDungeonWorld(),heroes:[{
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

test("current Expedition Archive does not disclose unobserved fight outcome or secret resources",()=>{
  const {state:progressed,event}=realSpatialTapeFixture(6,"monster");
  const hero=progressed.adventurers.find(h=>h.id===event.adventurerId)!;
  assert(event.dungeonReplay);
  const baseline={...progressed,events:[event]};
  const visible=selectExpeditionArchive(baseline);
  assert.equal(visible.length,1);
  assert.equal(visible[0].kind,"combat");
  assert.equal(visible[0].label,"Recorded expedition");
  assert.equal(visible[0].hasReplay,true);
  assert.equal(visible[0].heroId,hero.id);
  const hiddenChange={...baseline,
    adventurers:progressed.adventurers.map(h=>h.id===hero.id?{
      ...h,health:0,status:"dead" as const,level:99,xp:99999,gold:999999,
      inventory:{...h.inventory,finds:{"iron-ore":500}},
    }:h),
    events:[{...event,message:"VICTORY: 3000 gold, secret chamber"}],
  };
  assert.deepEqual(selectExpeditionArchive(hiddenChange),visible,
    "Archive cards cannot expose private outcome, HP, XP, gold or loot");
  assert(!/SECRET|VICTORY|999|death|secret chamber/i.test(JSON.stringify(visible)));
  const unchanged=structuredClone(hiddenChange);
  selectExpeditionArchive(hiddenChange);
  assert.deepEqual(hiddenChange,unchanged,"Archive reads never mutate state");
});

test("authentic Level-10 party footage is browsable and pinnable in the same archive",()=>{
  const initial=createGameState(7351);
  const actual=initial.adventurers.slice(0,3).map(hero=>({
    ...hero,level:12,xp:1100,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    inventory:{...hero.inventory,bread:2,healing:3},
  }));
  const options=caveTrollPartyOptions(actual,42);
  const fight=resolveGroupCombat(options,90);
  assert.equal(fight.replay.actors.length,4);
  const hero=actual[0];
  const event:WorldEvent={
    id:"day-1:"+hero.id+":dungeon-live:200",day:1,type:"dungeon-live",
    worldTick:200,adventurerId:hero.id,
    message:"Authentic saved Floor-10 Cave Troll fight.",
    partyBossReplay:fight.replay,
  };
  const state={...initial,events:[event],savedReplayIds:[]};
  const before=structuredClone(state);
  const entry=selectExpeditionArchive(state)[0];
  assert.equal(entry.id,event.id);
  assert.equal(entry.floor,10);
  assert.equal(entry.partySize,3);
  assert.equal(entry.partyBoss,true);
  assert.equal(entry.kind,"combat");
  assert.equal(entry.hasReplay,true);
  assert.deepEqual(archiveBookmarks(state,event.id),[
    {id:"start",label:"Watch saved combat",replaySeconds:0},
  ]);
  assert.deepEqual(selectExpeditionArchive(
    {...state,savedReplayIds:[event.id]},"saved").map(e=>e.id),[event.id]);
  assert.deepEqual(state,before,
    "Listing recorded party fights must never simulate or change the world");
});

test("ordinary Floor-6 recording routes to the same viewer as all normal dungeon floors",()=>{
  const {state:next,event}=realSpatialTapeFixture(6,"monster");
  assert(event.dungeonReplay);
  const entry=selectExpeditionArchive(next).find(e=>e.id===event.id);
  assert(entry);
  assert.equal(entry.floor,6);
  assert.equal(entry.partyBoss,false);
  assert.equal(archiveRecordingDestination(entry),"dungeon");
  assert(archiveBookmarks(next,event.id).length>0);
  assert.equal(archiveRecordingDestination({...entry,partyBoss:true}),"party-boss");
});
