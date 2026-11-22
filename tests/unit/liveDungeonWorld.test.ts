import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,DUNGEON_WORLD_EVENT_SUBJECT,
  LIVE_COMBAT_INTERVAL_TICKS,LIVE_COMBAT_EVENT_SUBJECT,
  SHOP_PORTAL_RETURN_PREFIX,SHOP_PORTAL_TRANSIT_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";
import {WORLD_TICKS_PER_DAY,lastWorldTickOfDay}
  from "../../src/game/worldClock.ts";
import {generateExpeditionLayout,dungeonDownStair,dungeonNeighbors,dungeonShortestPath,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {emptyLevel7World,chooseKnownReturnStep} from "../../src/game/level7Exploration.ts";

test("real world-clock event advances one dungeon step during shop play, not at bedtime",()=>{
  const store=new GameStore(createGameState(7351));
  const before=store.state;
  const initial=before.adventurers.filter(h=>h.status==="exploring");
  assert(initial.length>0);
  store.enableLiveDungeon();
  assert.equal(store.state.liveDungeon.enabled,true);
  assert.equal(store.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
  assert.equal(store.state.worldClock.pending[0].subjectId,DUNGEON_WORLD_EVENT_SUBJECT);
  const started=store.state;
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS-1);
  assert.deepEqual(store.state.adventurers,started.adventurers,
    "Dungeon must not move before its scheduled event.");
  assert.equal(store.state.liveDungeon.lastStepTick,0);
  store.advanceWorldTime(1);
  assert.equal(store.state.worldClock.tick,DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal(store.state.liveDungeon.lastStepTick,DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.heroes.length>0);
  assert(store.state.liveDungeon.heroes.every(h=>h.steps===1));
  assert(store.state.earlyDungeonWorlds?.some(e=>e.world.heroes.length>0));
  assert(store.state.adventurers.some((hero,i)=>
    hero!==initial[i]&&hero.status==="exploring")||
    store.state.earlyDungeonWorlds!.length>0);
  assert.equal(store.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
  assert.equal(SIMULATION_VERSION,28);
});

test("pending expedition event, true positions, HP and rewards resume deterministically from JSON",()=>{
  const a=new GameStore(createGameState(7351));
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2+75);
  const resumed=parseSave(JSON.stringify(createSave(a.state)));
  const b=new GameStore(resumed);
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2);
  b.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*2);
  assert.deepEqual(a.state,b.state);
  const ids=a.state.events.map(e=>e.id);
  assert.equal(ids.length,new Set(ids).size,"Each live event must be unique.");
  assert.equal(a.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
});

test("sleep fast-forwards the SAME live scheduler and NEVER rolls a second dungeon day",()=>{
  const seed=7351;
  const direct=new GameStore(createGameState(seed));
  const paced=new GameStore(createGameState(seed));
  direct.enableLiveDungeon();
  paced.enableLiveDungeon();
  direct.endDay();
  paced.advanceWorldTime(lastWorldTickOfDay(1));
  paced.endDay();
  assert.deepEqual(direct.state,paced.state);
  assert.equal(direct.state.day,2);
  assert.equal(direct.state.worldClock.tick,WORLD_TICKS_PER_DAY);
  assert.equal(direct.state.liveDungeon.lastStepTick,WORLD_TICKS_PER_DAY);
  assert(direct.state.worldClock.pending.some(event=>
    event.lane==="expedition"&&event.dueTick===WORLD_TICKS_PER_DAY+
      DUNGEON_STEP_INTERVAL_TICKS));
  assert.deepEqual(parseSave(JSON.stringify(createSave(direct.state))),
    direct.state);
});

test("save validator refuses a second dungeon motor and forged pending/due ticks",()=>{
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  const valid=createSave(store.state);
  const tamper=(fn:(value:any)=>void,regex:RegExp)=>{
    const envelope=structuredClone(valid) as any;
    fn(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),regex);
  };
  tamper(s=>{s.liveDungeon.enabled=false;},/liveDungeon/);
  tamper(s=>{s.liveDungeon.lastStepTick=1;},/liveDungeon/);
  tamper(s=>{s.worldClock.pending.push(s.worldClock.pending[0]);},/pending/);
  tamper(s=>{s.worldClock.pending[0].subjectId="forged-world";},/liveDungeon/);
  tamper(s=>{s.worldClock.pending=[];},/liveDungeon/);
  tamper(s=>{s.liveDungeon.heroes=[{heroId:"ghost",steps:1,finished:false}];},/heroId/);
  assert.deepEqual(parseSave(JSON.stringify(valid)),store.state);
});

function activeFightFixture():GameStore {
  const seed=7351;
  const initial=createGameState(seed);
  const map=generateExpeditionLayout(seed,1);
  const monster=map.features.find(feature=>feature.kind==="monster"&&
    dungeonNeighbors(map,feature).length>0);
  assert(monster,"Fixture needs a genuine seeded monster.");
  const approach=dungeonNeighbors(map,monster)[0];
  const targetIndex=monster.z*map.width+monster.x;
  const visited=map.tiles.flatMap((cell,i)=>
    cell!=="wall"&&i!==targetIndex?[i]:[]);
  const hero=initial.adventurers.find(h=>h.status==="exploring"&&h.floor===1);
  assert(hero,"Fixture needs an existing live explorer.");
  const positioned={...initial,
    earlyDungeonWorlds:[{floor:1 as const,world:{
      ...emptyLevel7World(),heroes:[{
        heroId:hero.id,x:approach.x,z:approach.z,visited,
      }],
    }}],
  };
  return new GameStore(positioned);
}

test("real monster arrival starts a SAVED active fight, not a completed instant combat",()=>{
  const store=activeFightFixture();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const fights=store.state.liveDungeon.combats;
  assert(fights.length>0,"Exploring the only unknown adjacent monster must begin combat.");
  const fight=fights[0];
  assert.equal(fight.state.outcome,"fighting");
  assert.equal(fight.state.time,0);
  assert.equal(fight.frames.length,1);
  assert(store.state.worldClock.pending.some(e=>e.lane==="expedition"&&
    e.subjectId===LIVE_COMBAT_EVENT_SUBJECT&&
    e.dueTick===store.state.worldClock.tick+LIVE_COMBAT_INTERVAL_TICKS));
  assert(!store.state.events.some(e=>e.dungeonReplay?.encounters.length),
    "Arrival alone must not archive or settle an unplayed battle.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("mid-combat JSON save resumes identical 60Hz actors, Herb debit and single site outcome",()=>{
  const a=activeFightFixture();
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(a.state.liveDungeon.combats.length>0);
  a.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS*3);
  const fight=a.state.liveDungeon.combats[0];
  assert(fight);
  assert.equal(fight.state.time>0,true);
  assert.equal(fight.frames.length,16,"0.5s bursts retain authentic 10Hz replay frames");
  const checkpoint=parseSave(JSON.stringify(createSave(a.state)));
  const b=new GameStore(checkpoint);
  assert.deepEqual(b.state,a.state);
  a.advanceWorldTime(520);
  b.advanceWorldTime(520);
  assert.deepEqual(b.state,a.state,"Future fighter state and settlement must be byte-identical");
  assert.equal(a.state.liveDungeon.combats.length,0);
  const actual=a.state.events.filter(e=>e.type==="dungeon-live"&&
    e.dungeonReplay?.encounters.length);
  assert(actual.length>0,"Battle results are committed to immutable footage.");
  assert(actual.every(e=>e.dungeonReplay?.encounters[0].combat.frames.length!>1));
  const ids=a.state.events.map(e=>e.id);
  assert.equal(ids.length,new Set(ids).size,"No double combat event IDs.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(a.state))),a.state);
});

test("v19 rejects tampered active fight clocks, fake fighter HP and duplicated reservations",()=>{
  const store=activeFightFixture();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS+LIVE_COMBAT_INTERVAL_TICKS);
  assert(store.state.liveDungeon.combats.length>0);
  const valid=createSave(store.state);
  const tamper=(fn:(value:any)=>void,pattern:RegExp)=>{
    const snapshot=structuredClone(valid) as any;
    fn(snapshot.payload);
    assert.throws(()=>parseSave(JSON.stringify(snapshot)),pattern);
  };
  tamper(s=>{s.liveDungeon.combatTick+=1;},/combat/);
  tamper(s=>{s.liveDungeon.combats[0].state.actors[0].hp=999999;},/hp/);
  tamper(s=>{s.liveDungeon.combats.push(s.liveDungeon.combats[0]);},/combats|featureId|heroIds/);
  tamper(s=>{s.worldClock.pending=s.worldClock.pending.filter(
    (e:any)=>e.subjectId!==LIVE_COMBAT_EVENT_SUBJECT);},/liveDungeon/);
  tamper(s=>{s.liveDungeon.combats[0].encounter.options.actors[0].damage+=50;},/options/);
  tamper(s=>{
    const monster=s.liveDungeon.combats[0].state.actors
      .find((actor:any)=>actor.team==="monsters");
    monster.activeMeleeAbility="troll-slam";
  },/activeMeleeAbility/);
  assert.deepEqual(parseSave(JSON.stringify(valid)),store.state);
});

function shortRealReturnFixture():{store:GameStore;heroId:string;path:{x:number;z:number}[]} {
  const seed=7351,initial=createGameState(seed);
  const layout=generateExpeditionLayout(seed,1);
  const points=layout.tiles.flatMap((tile,index)=>
    tile!=="wall"?[{x:index%layout.width,z:Math.floor(index/layout.width)}]:[]);
  const selected=points.map(point=>({
    point,route:dungeonShortestPath(layout,layout.entrance,point),
  })).find(({route})=>route.length===5&&route.every(point=>
    !layout.features.some(f=>f.x===point.x&&f.z===point.z)));
  assert(selected,"The seeded dungeon must have a safe known four-edge route.");
  const path=selected.route;
  const hero=initial.adventurers.find(h=>h.status==="exploring");
  assert(hero);
  const adventurers=initial.adventurers.map(h=>h.id===hero.id?{
    ...h,floor:1 as const,status:"exploring" as const,
    inventory:{...h.inventory,loot:2,
      finds:{"iron-ore":1}},
  }:h);
  const world={...emptyLevel7World(),heroes:[{
    heroId:hero.id,x:path.at(-1)!.x,z:path.at(-1)!.z,
    visited:path.map(p=>p.z*layout.width+p.x),
  }]};
  return {heroId:hero.id,path,store:new GameStore({...initial,adventurers,
    earlyDungeonWorlds:[{floor:1 as const,world}]})};
}

test("homeward steps use only saved, connected, previously explored dungeon tiles",()=>{
  const fixture=shortRealReturnFixture();
  const layout=generateExpeditionLayout(7351,1);
  let current=fixture.path.at(-1)!;
  for(let i=fixture.path.length-1;i>0;i--){
    const next=chooseKnownReturnStep(layout,{
      heroId:fixture.heroId,...current,
      visited:fixture.path.map(p=>p.z*layout.width+p.x),
    });
    assert(next);
    assert(fixture.path.some(p=>p.x===next.x&&p.z===next.z));
    assert.equal(Math.abs(next.x-current.x)+Math.abs(next.z-current.z),1);
    current=next;
  }
  assert.deepEqual(current,layout.entrance);
  assert.equal(chooseKnownReturnStep(layout,{heroId:fixture.heroId,
    ...current,visited:fixture.path.map(p=>p.z*layout.width+p.x)}),null);
});

test("actual shop return crosses known tiles, survives reload and arrives DURING the same world day",()=>{
  const {store:a,heroId}=shortRealReturnFixture();
  a.enableLiveDungeon();
  const initial=a.state;
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(a.state.liveDungeon.returns.some(j=>j.heroId===heroId&&j.phase==="backtrack"),
    "The actual looted hero chooses to start a return, not teleport to the shop.");
  assert.equal(a.state.adventurers.find(h=>h.id===heroId)?.status,"exploring");
  assert.equal(a.state.worldClock.tick,DUNGEON_STEP_INTERVAL_TICKS);
  const b=new GameStore(parseSave(JSON.stringify(createSave(a.state))));
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*7);
  b.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*7);
  assert.deepEqual(a.state,b.state,"Return path, portal and shops resume identically.");
  const traveler=a.state.adventurers.find(h=>h.id===heroId)!;
  assert.equal(traveler.status,"at-shop");
  assert.equal(traveler.floor,5);
  assert.equal(traveler.inventory.loot,0,
    "Depositing a trip's abstract haul must stop the endless return-to-shop loop.");
  assert.deepEqual(traveler.inventory.finds,{"iron-ore":1},
    "Real unsold material ownership remains with the hero for optional buyback.");
  assert.equal(a.state.day,1,"The bed, not an arrival, ends the day.");
  const arrival=a.state.events.filter(e=>
    e.type==="shop-arrival"&&e.adventurerId===heroId);
  assert.equal(arrival.length,1,"Arrival is the unique true portal crossing.");
  assert(arrival[0].worldTick!>initial.worldClock.tick);
  assert.equal(a.state.liveDungeon.returns.some(j=>j.heroId===heroId),false);
  assert.equal(a.state.shopEconomy.dailySales.revenue,initial.shopEconomy.dailySales.revenue,
    "A returning explorer is not an invented purchase.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(a.state))),a.state);
});

test("strict v20 saves reject forged backtracks and duplicated portal events",()=>{
  const {store,heroId}=shortRealReturnFixture();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.returns.some(j=>j.heroId===heroId));
  const tamper=(snapshot:ReturnType<typeof createSave>,
    fn:(v:any)=>void,re:RegExp)=>{
    const modified=structuredClone(snapshot) as any;
    fn(modified.payload);
    assert.throws(()=>parseSave(JSON.stringify(modified)),re);
  };
  const walking=createSave(store.state);
  tamper(walking,s=>{s.liveDungeon.returns[0].heroId="adventurer-99999";},/returns/);
  tamper(walking,s=>{s.liveDungeon.returns[0].phase="portal";},/dueTick|returns/);
  tamper(walking,s=>{s.liveDungeon.returns.push(s.liveDungeon.returns[0]);},/returns/);
  for(let i=0;i<10&&store.state.liveDungeon.returns[0]?.phase!=="portal";i++)
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const portal=store.state.liveDungeon.returns.find(j=>j.heroId===heroId);
  assert.equal(portal?.phase,"portal");
  const stable=createSave(store.state);
  tamper(stable,s=>{s.liveDungeon.returns[0].dueTick+=1;},/dueTick|returns/);
  tamper(stable,s=>{s.worldClock.pending=s.worldClock.pending.filter(
    (e:any)=>!e.subjectId.startsWith(SHOP_PORTAL_RETURN_PREFIX));},/dueTick|returns/);
  tamper(stable,s=>{s.adventurers.find((h:any)=>h.id===heroId).status="at-shop";},/floor|returns/);
  tamper(stable,s=>{
    const world=s.earlyDungeonWorlds.find((e:any)=>e.floor===1).world;
    const position=world.heroes.find((h:any)=>h.heroId===heroId);
    const other=position.visited.find((cell:number)=>cell!==1+19);
    position.x=other%19;position.z=Math.floor(other/19);
  },/entrance|returns/);
  assert(stable.payload.worldClock.pending.some(e=>
    e.subjectId===SHOP_PORTAL_RETURN_PREFIX+heroId&&
    e.dueTick===stable.payload.worldClock.tick+SHOP_PORTAL_TRANSIT_TICKS));
  assert.deepEqual(parseSave(JSON.stringify(stable)),store.state);
});


test("a second real same-day portal crossing has a new unique event, not a phantom sale",()=>{
  const {store:fixture,heroId}=shortRealReturnFixture();
  // Historical first arrival must not suppress a genuinely traversed
  // dungeon-to-shop portal crossing later in the same world day.
  const historical={id:"day-1:"+heroId+":shop-arrival",
    type:"shop-arrival" as const,day:1,adventurerId:heroId,
    message:"Earlier real shop visit."};
  const a=new GameStore({...fixture.state,
    events:[...fixture.state.events,historical]});
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*8);
  const arrivals=a.state.events.filter(e=>
    e.type==="shop-arrival"&&e.adventurerId===heroId);
  assert.equal(arrivals.length,2);
  assert.notEqual(arrivals[0].id,arrivals[1].id);
  assert(arrivals[1].worldTick!>0);
  assert.equal(a.state.shopEconomy.dailySales.revenue,0,
    "A genuine portal arrival is not a transaction.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(a.state))),a.state);
});

function livePartyFixture():{store:GameStore;ids:readonly string[]} {
  const base=createGameState(7351);
  const layout=generateExpeditionLayout(7351,1);
  const members=base.adventurers.filter(h=>h.status==="exploring").slice(0,2);
  assert.equal(members.length,2);
  const ids=members.map(h=>h.id);
  const adventurers=base.adventurers.map(h=>ids.includes(h.id)?{
    ...h,floor:1 as const,status:"exploring" as const,
    health:h.stats.maxHealth,role: h.id===ids[0]?"healer" as const:"tank" as const,
    traits:{...h.traits,negative:"stubborn"},
    inventory:{...h.inventory,loot:0},
  }:h.status==="exploring"?{...h,floor:4 as const}:h);
  const entrance=layout.entrance.z*layout.width+layout.entrance.x;
  const world={...emptyLevel7World(),
    resolvedFeatureIds:layout.features.map(f=>f.id),
    heroes:ids.map(heroId=>({heroId,...layout.entrance,visited:[entrance]})),
  };
  return {ids,store:new GameStore({...base,adventurers,
    earlyDungeonWorlds:[{floor:1 as const,world}]})};
}

test("LIVE Temporary Party forms on one physical tile, persists and splits on individual resupply",()=>{
  const fixture=livePartyFixture();
  const store=fixture.store;
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  let party=store.state.dungeonParties?.find(p=>
    fixture.ids.every(id=>p.memberIds.includes(id)));
  assert(party,"Willing co-located companions should form a real live TP.");
  assert.equal(party.floor,1);
  assert.equal(party.formedDay,1);
  const joins=store.state.events.filter(e=>e.type==="temporary-party-join"&&
    fixture.ids.includes(e.adventurerId!));
  assert.equal(joins.length,2);
  assert(joins.every(e=>e.worldTick===DUNGEON_STEP_INTERVAL_TICKS));
  const snap=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(snap,store.state);
  const replay=new GameStore(snap);
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  replay.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(store.state,replay.state);
  assert.equal(store.state.events.filter(e=>e.type==="temporary-party-join"&&
    fixture.ids.includes(e.adventurerId!)).length,2,
    "A stable party does not join again on each world event.");

  // An actual independent need overrides companionship; Galvik never commands it.
  const forced={...store.state,adventurers:store.state.adventurers.map(h=>
    h.id===fixture.ids[0]?{...h,inventory:{...h.inventory,loot:2}}:h)};
  const next=new GameStore(forced);
  next.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(next.state.liveDungeon.returns.some(j=>j.heroId===fixture.ids[0]),
    "Actual loot creates the hero's own resupply decision.");
  assert(!next.state.dungeonParties?.some(p=>fixture.ids.every(id=>
    p.memberIds.includes(id))),"Dissent disbands rather than forcing travel.");
  const leaves=next.state.events.filter(e=>e.type==="temporary-party-leave"&&
    fixture.ids.includes(e.adventurerId!));
  assert.equal(leaves.length,2);
  assert.equal(new Set(next.state.events.map(e=>e.id)).size,
    next.state.events.length,"Real-time TP history is not duplicated.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(next.state))),next.state);
});

function authoredStairFixture():{store:GameStore;heroId:string;stair:{x:number;z:number}}{
  const seed=7351,base=createGameState(seed);
  const layout=generateExpeditionLayout(seed,1);
  const stair=dungeonDownStair(layout);
  const hero=base.adventurers.find(h=>h.status==="exploring");
  assert(hero);
  const adventurers=base.adventurers.map(h=>h.id===hero.id?{
    ...h,floor:1 as const,status:"exploring" as const,
    health:h.stats.maxHealth,equipment:{...h.equipment,weapon:"Iron Sword" as const},
    inventory:{...h.inventory,loot:0},
  }:h.status==="exploring"?{...h,floor:4 as const}:h);
  const known=layout.tiles.flatMap((cell,i)=>cell==="wall"?[]:[i]);
  const world={...emptyLevel7World(),
    resolvedFeatureIds:layout.features.map(f=>f.id),
    heroes:[{heroId:hero.id,...stair,visited:known}]};
  return {heroId:hero.id,stair,store:new GameStore({...base,adventurers,
    earlyDungeonWorlds:[{floor:1 as const,world}]})};
}

test("real hero strategy descends ONLY from discovered connected stairs and resumes across saves",()=>{
  const {store,heroId,stair}=authoredStairFixture();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const hero=store.state.adventurers.find(h=>h.id===heroId)!;
  assert.equal(hero.floor,1);
  assert.equal(store.state.liveDungeon.plans.find(p=>p.heroId===heroId)?.action,
    "descend","Real gear and explored room knowledge generate an autonomous plan.");
  const checkpoint=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(checkpoint);
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  resumed.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(store.state,resumed.state);
  assert.equal(store.state.adventurers.find(h=>h.id===heroId)?.floor,2,
    "Floor depth changes only on a subsequent real movement event at the stair.");
  const here=store.state.earlyDungeonWorlds?.find(x=>x.floor===1)!.world.heroes
    .find(p=>p.heroId===heroId)!;
  assert.deepEqual({x:here.x,z:here.z},stair,
    "Visited original floor remains saved for future returns.");
  const destination=generateExpeditionLayout(7351,2).entrance;
  const there=store.state.earlyDungeonWorlds?.find(x=>x.floor===2)!.world.heroes
    .find(p=>p.heroId===heroId)!;
  assert.deepEqual({x:there.x,z:there.z},destination);
  assert.equal(store.state.liveDungeon.plans.some(p=>p.heroId===heroId),false,
    "New floor requires a fresh real decision, not recursive floor skipping.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("v21 rejects fabricated AI intentions and invalid plan-tick ownership",()=>{
  const {store}=authoredStairFixture();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.plans.length);
  const raw=createSave(store.state);
  const tamper=(change:(p:any)=>void,pattern:RegExp)=>{
    const corrupted=structuredClone(raw) as any;change(corrupted.payload);
    assert.throws(()=>parseSave(JSON.stringify(corrupted)),pattern);
  };
  tamper(s=>{delete s.liveDungeon.plans;},/plans/);
  tamper(s=>{s.liveDungeon.plans[0].heroId="adventurer-9999";},/plans/);
  tamper(s=>{s.liveDungeon.plans[0].action="teleport";},/plans/);
  tamper(s=>{s.liveDungeon.plans[0].updatedTick=s.worldClock.tick+1;},/updatedTick/);
  tamper(s=>{s.liveDungeon.plans.push(s.liveDungeon.plans[0]);},/plans/);
  assert.deepEqual(parseSave(JSON.stringify(raw)),store.state);
});

test("LIVE dungeon commits one physical tile every ten real seconds",()=>{
  assert.equal(DUNGEON_STEP_INTERVAL_TICKS,200);
});
