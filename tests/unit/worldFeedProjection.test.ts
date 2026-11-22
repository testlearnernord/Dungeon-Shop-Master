import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,type WorldEvent} from "../../src/game/gameState.ts";
import {initialWorldFeedCritical,projectWorldFeedChanges}
  from "../../src/game/worldFeedProjection.ts";
import type {LiveDungeonCombat} from "../../src/game/liveDungeonRuntime.ts";

test("one authentic magical death is a critical event with no hidden death cause",()=>{
  const before=createGameState(7351),hero=before.adventurers[0];
  const death={id:"day-1:"+hero.id+":hero-death-signal:200",
    day:1,type:"hero-death-signal" as const,worldTick:200,
    adventurerId:hero.id,
    message:hero.name+"'s life-signature has been extinguished."};
  const after={...before,events:[...before.events,death]};
  const feed=projectWorldFeedChanges(before,after);
  assert.equal(feed.length,1);
  assert.equal(feed[0].category,"death");
  assert.equal(feed[0].priority,3);
  assert.deepEqual(feed[0].target,{kind:"death-footage",heroId:hero.id,signalId:death.id});
  assert.match(feed[0].detail,/magical signal/);
  assert.doesNotMatch(feed[0].detail,/trap|spike|killer|floor [0-9]/i);
  assert.deepEqual(initialWorldFeedCritical(after),feed[0]);
  assert.equal(initialWorldFeedCritical(before),null);
  assert.deepEqual(projectWorldFeedChanges(after,after),[],
    "Rerendering a checkpoint must never produce a second death notice");
});

test("two committed member joins are one real Party notification",()=>{
  const before=createGameState(7351),[a,b]=before.adventurers;
  const party={memberIds:[a.id,b.id],floor:3 as const,formedDay:1};
  const events=[a,b].map(hero=>({
    id:"day-1:"+hero.id+":temporary-party-join",
    type:"temporary-party-join" as const,day:1,adventurerId:hero.id,
    message:hero.name+" joined a Temporary Party.",
  }));
  const after={...before,events:[...before.events,...events],dungeonParties:[party]};
  const results=projectWorldFeedChanges(before,after);
  assert.equal(results.length,1);
  assert.equal(results[0].category,"party");
  assert.match(results[0].detail,/Floor 3/);
  assert.match(results[0].detail,new RegExp(a.name.split(" ")[0]));
  assert.deepEqual(results[0].target,{kind:"hero",heroId:a.id});
});

test("live fight and boss notifications are based on new authoritative IDs only",()=>{
  const before=createGameState(7351),hero=before.adventurers[0];
  const combat={
    id:"real-combat-1",heroIds:[hero.id],
    encounter:{floor:1,options:{actors:[
      {team:"heroes"},{team:"monsters"},{team:"monsters"},
    ]}},
  } as unknown as LiveDungeonCombat;
  const after={...before,liveDungeon:{...before.liveDungeon,
    combats:[combat]}};
  const items=projectWorldFeedChanges(before,after);
  assert.equal(items.length,1);
  assert.equal(items[0].category,"combat");
  assert.match(items[0].detail,/2 Ghouls · Floor 1/);
  assert.deepEqual(items[0].target,{kind:"combat",fightId:combat.id});
  assert.deepEqual(projectWorldFeedChanges(after,{
    ...after,worldClock:{...after.worldClock,tick:10},
    liveDungeon:{...after.liveDungeon,combats:[{...combat}]},
  }),[],"A 60Hz combat frame is not a second fight start");
  const companion=before.adventurers[1];
  const boss={
    id:"real-party-boss-1",heroIds:[hero.id,companion.id],
  } as NonNullable<typeof before.liveDungeon.partyBossCombat>;
  const facingBoss={...after,liveDungeon:{...after.liveDungeon,
    partyBossCombat:boss}};
  const important=projectWorldFeedChanges(after,facingBoss);
  assert.equal(important.length,1);
  assert.equal(important[0].category,"boss");
  assert.equal(important[0].title,"FLOOR 10 · THE CAVE TROLL AWAKENS");
  assert.deepEqual(important[0].target,{kind:"combat",fightId:boss.id});
  assert.equal(important[0].priority,3);
});

test("routine world time, unknown events and unrevealed recordings never create alerts",()=>{
  const before=createGameState(7351);
  assert.deepEqual(projectWorldFeedChanges(before,{
    ...before,worldClock:{...before.worldClock,tick:10},
  }),[]);
  assert.deepEqual(projectWorldFeedChanges(before,{
    ...before,events:[...before.events,{
      id:"test-unrelated-shop-stay",day:1,type:"shop-stay" as const,
      message:"SECRET OUTCOME! This cannot be shown by a passive feed.",
    }],
  }),[]);
});

test("one real party chest creates one notice with exact items, equipment and gold",()=>{
  const seed=createGameState(7351),[a,b]=seed.adventurers;
  const before={...seed,adventurers:seed.adventurers.map(h=>
    h.id===a.id||h.id===b.id?{...h,floor:1,status:"exploring" as const}:h),
    dungeonParties:[{memberIds:[a.id,b.id],floor:1 as const,formedDay:1}]};
  const updated=before.adventurers.map(h=>{
    if(h.id===a.id)return {...h,gold:h.gold+5,
      inventory:{...h.inventory,finds:{...h.inventory.finds,"iron-ore":2}}};
    if(h.id===b.id)return {...h,gold:h.gold+8,
      inventory:{...h.inventory,finds:{...h.inventory.finds,coal:1}},
      equipment:{...h.equipment,weapon:"Iron Sword" as const}};
    return h;
  });
  const events=[a,b].map(h=>({
    id:"treasure:"+h.id,day:1,worldTick:200,
    type:"dungeon-live" as const,adventurerId:h.id,
    dungeonHighlight:"treasure" as const,
    message:"Committed real spatial treasure step",
  }));
  const after={...before,adventurers:updated,
    events:[...before.events,...events]};
  const feed=projectWorldFeedChanges(before,after);
  assert.equal(feed.length,1,"One party, one real chest, one notification");
  assert.equal(feed[0].title,"PARTY CHEST LOOTED");
  assert.match(feed[0].detail,/2 Iron Ore/);
  assert.match(feed[0].detail,/1 Coal/);
  assert.match(feed[0].detail,/1 Iron Sword/);
  assert.match(feed[0].detail,/\+13 gold/);
  assert.match(feed[0].detail,/Floor 1/);
  assert.deepEqual(projectWorldFeedChanges(after,after),[]);
});

test("one real group trap publishes each hero's actual damage exactly once",()=>{
  const seed=createGameState(7351),[a,b]=seed.adventurers;
  const before={...seed,adventurers:seed.adventurers.map(h=>
    h.id===a.id||h.id===b.id?{...h,floor:2,status:"exploring" as const}:h),
    dungeonParties:[{memberIds:[a.id,b.id],floor:2 as const,formedDay:1}]};
  const after={...before,adventurers:before.adventurers.map(h=>
    h.id===a.id?{...h,health:h.health-5}:
    h.id===b.id?{...h,health:h.health-8}:h),
    events:[...before.events,...[a,b].map(h=>({
      id:"trap:"+h.id,day:1,worldTick:300,
      type:"dungeon-live" as const,adventurerId:h.id,
      dungeonHighlight:"trap" as const,message:"Real trap committed",
    }))]};
  const feed=projectWorldFeedChanges(before,after);
  assert.equal(feed.length,1);
  assert.equal(feed[0].title,"PARTY TRIGGERED A TRAP");
  assert.match(feed[0].detail,new RegExp(a.name+".*−5 HP"));
  assert.match(feed[0].detail,new RegExp(b.name+".*−8 HP"));
  assert.deepEqual(projectWorldFeedChanges(after,after),[]);
});

test("only ACTUAL floor crossing announces ascend/descend, never route intent",()=>{
  const seed=createGameState(7351),hero=seed.adventurers[0];
  const before={...seed,adventurers:seed.adventurers.map(h=>
    h.id===hero.id?{...h,floor:2,status:"exploring" as const}:h)};
  const event={id:"actual-floor-change",day:1,worldTick:450,
    type:"dungeon-live" as const,adventurerId:hero.id,
    floorAction:"descend" as const,message:"Planned descent"};
  const planned={...before,events:[...before.events,event]};
  assert.deepEqual(projectWorldFeedChanges(before,planned),[],
    "Choosing a descent without reaching the stairs is not a floor change");
  const crossed={...planned,adventurers:before.adventurers.map(h=>
    h.id===hero.id?{...h,floor:3}:h)};
  const feed=projectWorldFeedChanges(before,crossed);
  assert.equal(feed.length,1);
  assert.equal(feed[0].category,"depth");
  assert.match(feed[0].detail,/Floor 2 → 3/);
  assert.equal(feed[0].title,"ADVENTURER DESCENDED");
});


test("one authentic winning group combat reports exact per-hero XP, items and gold",()=>{
  const seed=createGameState(7351),[a,b]=seed.adventurers;
  const before={...seed,adventurers:seed.adventurers.map(hero=>
    hero.id===a.id||hero.id===b.id?
      {...hero,status:"exploring" as const,floor:1 as const}:hero)};
  const tape={floor:1,encounters:[{featureId:"ghoul-site-2",siteCycle:3,
    combat:{outcome:"heroes",frames:[{t:0},{t:8.2}]}}]};
  const events=[a,b].map(hero=>({
    id:"winning-tape:"+hero.id,day:1,worldTick:500,
    type:"dungeon-live",adventurerId:hero.id,
    dungeonReplay:tape,
    message:"True recorded battle",
  } as unknown as WorldEvent));
  const after={...before,adventurers:before.adventurers.map(hero=>{
    if(hero.id===a.id)return {...hero,xp:hero.xp+24,gold:hero.gold+2,
      inventory:{...hero.inventory,finds:{...hero.inventory.finds,"iron-ore":1}}};
    if(hero.id===b.id)return {...hero,xp:hero.xp+24,gold:hero.gold+2,
      equipment:{...hero.equipment,armor:"Leather Vest" as const}};
    return hero;
  }),events:[...before.events,...events]};
  const result=projectWorldFeedChanges(before,after);
  assert.equal(result.length,1,"Party victory should not issue two notifications");
  const win=result[0];
  assert.equal(win.title,"PARTY VICTORIOUS");
  assert.equal(win.category,"combat");
  assert.ok(win.detail.includes(a.name+" +24 XP"));
  assert.ok(win.detail.includes(b.name+" +24 XP"));
  assert.match(win.detail,/1 Iron Ore/);
  assert.match(win.detail,/1 Leather Vest/);
  assert.match(win.detail,/\+4 gold/);
  assert.deepEqual(win.target,{kind:"recorded-fight",
    eventId:events[0].id,featureId:"ghoul-site-2",siteCycle:3});
  assert.deepEqual(projectWorldFeedChanges(after,after),[],
    "Same recorded combat checkpoint cannot replay as a new notification");
});

test("retreats and unfinished combat never become imaginary victories",()=>{
  const before=createGameState(7351),hero=before.adventurers[0];
  const tape={floor:1,encounters:[{featureId:"ghoul-site",
    combat:{outcome:"monsters",frames:[{t:0}]}}]};
  const event={id:"lost-tape",type:"dungeon-live",day:1,worldTick:350,
    adventurerId:hero.id,dungeonReplay:tape,
    message:"A completed defeat"} as unknown as WorldEvent;
  assert.deepEqual(projectWorldFeedChanges(before,{...before,
    events:[...before.events,event]}),[]);
  const pending={...event,id:"pending-tape",
    dungeonReplay:{...tape,encounters:[{featureId:"ghoul-site",
      combat:{outcome:"fighting",frames:[{t:0}]}}]}} as unknown as WorldEvent;
  assert.deepEqual(projectWorldFeedChanges(before,{...before,
    events:[...before.events,pending]}),[]);
});

test("each genuine level-up is a separate hero-profile target, without fake milestones",()=>{
  const before=createGameState(7351),[a,b]=before.adventurers;
  const after={...before,adventurers:before.adventurers.map(hero=>
    hero.id===a.id?{...hero,level:hero.level+1,xp:hero.xp+105}:
    hero.id===b.id?{...hero,level:hero.level+2,xp:hero.xp+205}:hero)};
  const result=projectWorldFeedChanges(before,after);
  assert.equal(result.length,2);
  assert.ok(result.every(e=>e.category==="levelup"&&e.title==="HERO LEVEL UP"));
  assert.deepEqual(result.map(e=>e.target),[
    {kind:"hero-profile",heroId:a.id},{kind:"hero-profile",heroId:b.id}]);
  assert.match(result[0].detail,/Level 1 → 2 · \+105 XP/);
  assert.match(result[1].detail,/Level 1 → 3 · \+205 XP/);
  assert.deepEqual(projectWorldFeedChanges(after,after),[]);
  const noLevel={...before,adventurers:before.adventurers.map(hero=>
    hero.id===a.id?{...hero,xp:hero.xp+30}:hero)};
  assert.deepEqual(projectWorldFeedChanges(before,noLevel),[],
    "XP gain is not automatically a level-up");
});

test("retired Floor-6 solo tapes cannot impersonate a current boss victory",()=>{
  const before=createGameState(7351),hero=before.adventurers[0];
  const stale={
    id:"day-1:"+hero.id+":level6-combat",type:"level6-combat",day:1,
    adventurerId:hero.id,combatOutcome:"victory",
    combatReplay:{frames:[{t:0}]},message:"Retired solo boss",
  } as unknown as WorldEvent;
  const after={...before,events:[...before.events,stale],
    adventurers:before.adventurers.map(h=>h.id===hero.id
      ?{...h,xp:h.xp+43,gold:h.gold+19}:h)};
  const entries=projectWorldFeedChanges(before,after);
  assert(!entries.some(entry=>entry.category==="boss"),
    "A retired Solo-F6 event cannot impersonate the live Floor-10 party boss");
});
