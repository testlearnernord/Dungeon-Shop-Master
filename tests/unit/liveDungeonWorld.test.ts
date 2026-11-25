import {chooseLiveHeroDungeonDecision,salvageReturnThreshold,isBossExpeditionCandidate,canRiskOrdinaryDescent,selectKnownResourceSite} from "../../src/game/dungeonDecisions.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,DUNGEON_WORLD_EVENT_SUBJECT,
  LIVE_COMBAT_INTERVAL_TICKS,LIVE_COMBAT_EVENT_SUBJECT,
  SHOP_PORTAL_RETURN_PREFIX,SHOP_PORTAL_TRANSIT_TICKS,activateLiveDungeon,type DungeonDiagnostic}
  from "../../src/game/liveDungeonRuntime.ts";
import {WORLD_TICKS_PER_DAY,lastWorldTickOfDay}
  from "../../src/game/worldClock.ts";
import {generateExpeditionLayout,dungeonDownStair,dungeonNeighbors,dungeonShortestPath,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld,chooseKnownReturnStep,SPATIAL_DUNGEON_COMBAT_SECONDS} from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld} from "../../src/game/dungeonMonsterWorld.ts";
import {hasDungeonLineOfSight} from "../../src/game/heroPerception.ts";

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
  assert(store.state.dungeonWorlds?.some(e=>e.world.heroes.length>0));
  assert(store.state.adventurers.some((hero,i)=>
    hero!==initial[i]&&hero.status==="exploring")||
    store.state.dungeonWorlds!.length>0);
  assert.equal(store.state.worldClock.pending.filter(e=>e.lane==="expedition").length,1);
  assert.equal(SIMULATION_VERSION,42);
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
  const expedition=a.state.worldClock.pending.filter(e=>e.lane==="expedition");
  assert.equal(expedition.filter(e=>e.subjectId===DUNGEON_WORLD_EVENT_SUBJECT).length,1,
    "There is exactly one world movement clock.");
  const hasFight=a.state.liveDungeon.combats.length>0||!!a.state.liveDungeon.partyBossCombat;
  assert.equal(expedition.filter(e=>e.subjectId===LIVE_COMBAT_EVENT_SUBJECT).length,
    hasFight?1:0,"All active fights share exactly one combat clock.");
  assert.equal(expedition.length,hasFight?2:1,"No additional expedition clock owner.");
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
    dungeonWorlds:[{floor:1 as const,world:{
      ...emptySpatialDungeonWorld(),heroes:[{
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
  const settlementBudget=SPATIAL_DUNGEON_COMBAT_SECONDS*20+LIVE_COMBAT_INTERVAL_TICKS;
  a.advanceWorldTime(settlementBudget);
  b.advanceWorldTime(settlementBudget);
  assert.deepEqual(b.state,a.state,"Future fighter state and settlement must be byte-identical");
  assert(!a.state.liveDungeon.combats.some(c=>c.id===fight.id),
    "The original fight must settle within its bounded combat duration, even if another fight begins.");
  const actual=a.state.events.filter(e=>e.type==="dungeon-live"&&
    fight.heroIds.includes(e.adventurerId??"")&&
    e.dungeonReplay?.encounters.some(encounter=>
      encounter.featureId===fight.encounter.featureId&&
      encounter.siteCycle===fight.encounter.siteCycle));
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
    health:Math.max(1,Math.floor(h.stats.maxHealth/3)),
    inventory:{...h.inventory,finds:{"iron-ore":1}},
  }:h);
  const world={...emptySpatialDungeonWorld(),heroes:[{
    heroId:hero.id,x:path.at(-1)!.x,z:path.at(-1)!.z,
    visited:path.map(p=>p.z*layout.width+p.x),
  }]};
  return {heroId:hero.id,path,store:new GameStore({...initial,adventurers,
    dungeonWorlds:[{floor:1 as const,world}]})};
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
    "An injured hero decides to backtrack rather than teleport to the shop.");
  assert.equal(a.state.adventurers.find(h=>h.id===heroId)?.status,"exploring");
  assert.equal(a.state.worldClock.tick,DUNGEON_STEP_INTERVAL_TICKS);
  const b=new GameStore(parseSave(JSON.stringify(createSave(a.state))));
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*7);
  b.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS*7);
  assert.deepEqual(a.state,b.state,"Return path, portal and shops resume identically.");
  const traveler=a.state.adventurers.find(h=>h.id===heroId)!;
  assert.equal(traveler.status,"at-shop");
  assert.equal(traveler.floor,"shop");
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
  const targetJourney=(s:any)=>{
    const journey=s.liveDungeon.returns.find((j:any)=>j.heroId===heroId);
    assert(journey,"Tamper the actual fixture hero, not another concurrent traveler.");
    return journey;
  };
  const walking=createSave(store.state);
  tamper(walking,s=>{targetJourney(s).heroId="adventurer-99999";},/returns/);
  tamper(walking,s=>{targetJourney(s).phase="portal";},/dueTick|returns/);
  tamper(walking,s=>{s.liveDungeon.returns.push(targetJourney(s));},/returns/);
  for(let i=0;i<10&&store.state.liveDungeon.returns.find(j=>j.heroId===heroId)?.phase!=="portal";i++)
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const portal=store.state.liveDungeon.returns.find(j=>j.heroId===heroId);
  assert.equal(portal?.phase,"portal");
  assert.equal(store.state.adventurers.find(h=>h.id===heroId)?.floor,"transit",
    "A real LIVE portal traveler is not on playable Dungeon Floor 4.");
  const stable=createSave(store.state);
  tamper(stable,s=>{targetJourney(s).dueTick+=1;},/dueTick|returns/);
  tamper(stable,s=>{s.adventurers.find((h:any)=>h.id===heroId).floor=4;},
    /floor|returns/);
  tamper(stable,s=>{s.worldClock.pending=s.worldClock.pending.filter(
    (e:any)=>e.subjectId!==SHOP_PORTAL_RETURN_PREFIX+heroId);},/dueTick|returns/);
  tamper(stable,s=>{s.adventurers.find((h:any)=>h.id===heroId).status="at-shop";},/floor|returns/);
  tamper(stable,s=>{
    const world=s.dungeonWorlds.find((e:any)=>e.floor===1).world;
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
    inventory:{...h.inventory},
  }:h.status==="exploring"?{...h,floor:4 as const}:h);
  const entrance=layout.entrance.z*layout.width+layout.entrance.x;
  const world={...emptySpatialDungeonWorld(),
    resolvedFeatureIds:layout.features.map(f=>f.id),
    heroes:ids.map(heroId=>({heroId,...layout.entrance,visited:[entrance]})),
  };
  return {ids,store:new GameStore({...base,adventurers,
    dungeonWorlds:[{floor:1 as const,world}]})};
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
    h.id===fixture.ids[0]?{...h,
      health:Math.max(1,Math.floor(h.stats.maxHealth/3))}:h)};
  const next=new GameStore(forced);
  next.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(next.state.liveDungeon.returns.some(j=>j.heroId===fixture.ids[0]),
    "A genuine injury creates the hero's independent resupply decision.");
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
    health:h.stats.maxHealth,equipment:{...h.equipment,weapon:h.role==="tank"?"Iron Sword":h.role==="DPS"?"Spear":"Staff"},
    inventory:{...h.inventory},
  }:h.status==="exploring"?{...h,floor:4 as const}:h);
  const known=layout.tiles.flatMap((cell,i)=>cell==="wall"?[]:[i]);
  const world={...emptySpatialDungeonWorld(),
    resolvedFeatureIds:layout.features.map(f=>f.id),
    heroes:[{heroId:hero.id,...stair,visited:known}]};
  return {heroId:hero.id,stair,store:new GameStore({...base,adventurers,
    dungeonWorlds:[{floor:1 as const,world}]})};
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
  const here=store.state.dungeonWorlds?.find(x=>x.floor===1)!.world.heroes
    .find(p=>p.heroId===heroId)!;
  assert.deepEqual({x:here.x,z:here.z},stair,
    "Visited original floor remains saved for future returns.");
  const destination=generateExpeditionLayout(7351,2).entrance;
  const there=store.state.dungeonWorlds?.find(x=>x.floor===2)!.world.heroes
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

test("LIVE dungeon commits one physical tile every 2.5 real seconds",()=>{
  assert.equal(DUNGEON_STEP_INTERVAL_TICKS,50);
});

test("diagnostics observe actual decisions without changing the campaign or save",()=>{
  const log:DungeonDiagnostic[]=[];
  const observed=new GameStore(createGameState(7351),entry=>log.push(entry));
  const plain=new GameStore(createGameState(7351));
  observed.enableLiveDungeon();plain.enableLiveDungeon();
  // Observe real scheduler boundaries instead of assuming a particular
  // fight is still active at one arbitrary tick after a balance change.
  let elapsed=0;
  const crossingFight=()=>observed.state.liveDungeon.combats.find(c=>
    c.startedTick<observed.state.liveDungeon.lastStepTick);
  while(elapsed<10000&&!crossingFight()){
    observed.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
    plain.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
    elapsed+=DUNGEON_STEP_INTERVAL_TICKS;
    assert.deepEqual(observed.state,plain.state);
  }
  assert(log.length>0);
  assert(log.some(entry=>entry.stage==="decision"&&entry.reason!==undefined));
  assert.deepEqual(observed.state,plain.state);
  const crossing=crossingFight();
  assert(crossing,"Within the bounded observation window a genuine fight crosses a later map tick");
  const save=createSave(observed.state);
  const plainSave=createSave(plain.state);
  assert.deepEqual({...save,savedAt:plainSave.savedAt},plainSave);
  assert.deepEqual(parseSave(JSON.stringify(save)),observed.state);
  const tampered=structuredClone(save);
  const forged=tampered.payload.liveDungeon.combats.find(c=>c.id===crossing.id)!;
  (forged as {startedTick:number}).startedTick+=1;
  assert.throws(()=>parseSave(JSON.stringify(tampered)),/startedTick/);
  // A repeat observer has exactly the same detached records, and no saved
  // telemetry fields or extra scheduled events.
  const repeat:DungeonDiagnostic[]=[];
  const again=new GameStore(createGameState(7351),entry=>repeat.push(entry));
  again.enableLiveDungeon();
  for(let tick=0;tick<elapsed;tick+=DUNGEON_STEP_INTERVAL_TICKS)
    again.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(log,repeat);
});

test("diagnostic captures the actual rejected Floor-9 solo stair crossing",()=>{
  const seed=7351,base=createGameState(seed);
  const hero=base.adventurers[0],layout=generateExpeditionLayout(seed,9);
  const down=dungeonDownStair(layout),visited=dungeonShortestPath(layout,layout.entrance,down)
    .map(p=>p.z*layout.width+p.x);
  const traces:DungeonDiagnostic[]=[];
  const active=activateLiveDungeon({...base,
    adventurers:base.adventurers.map(h=>h.id===hero.id?
      {...h,floor:9 as const,status:"exploring" as const,bossPass:true}:
      {...h,floor:"shop" as const,status:"at-shop" as const}),
    dungeonWorlds:[{floor:9 as const,world:{...emptySpatialDungeonWorld(),
      heroes:[{heroId:hero.id,...down,visited}]}}],
  });
  const store=new GameStore({...active,liveDungeon:{...active.liveDungeon,
    plans:[{heroId:hero.id,floor:9 as const,
      goal:"progress" as const,action:"descend" as const,updatedTick:0}]}},
    entry=>traces.push(entry));
  store.enableLiveDungeon();store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const gate=traces.find(entry=>entry.stage==="boss-crossing");
  assert(gate);assert.equal(gate.checks.savedParty,false);
  assert.equal(gate.checks.partySize,false);assert.equal(gate.checks.accepted,false);
  assert.equal(store.state.liveDungeon.partyBossCombat,null);
  assert.equal(store.state.adventurers.find(h=>h.id===hero.id)?.floor,9);
});

test("healthy committed descent survives an ordinary empty movement decision but never overrides resupply",()=>{
  const original=createGameState(7351).adventurers.find(h=>h.role==="tank")!;
  const hero={...original,level:3,xp:200,floor:3 as const,status:"exploring" as const,
    equipment:{weapon:"Iron Sword" as const,armor:"Leather Vest" as const}};
  const ready={...hero,health:heroProgression(hero).maxHealth};
  const layout=generateExpeditionLayout(7351,3);
  const progress={heroId:hero.id,...layout.entrance,
    visited:[layout.entrance.z*layout.width+layout.entrance.x]};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:3 as const,
    appearance:{role:hero.role,equipment:hero.equipment},steps:[],encounters:[],
    outcome:"exploring" as const};
  const committed={goal:"progress" as const,action:"descend" as const};
  assert.equal(chooseLiveHeroDungeonDecision(ready,progress,replay).action,"stay");
  assert.deepEqual(chooseLiveHeroDungeonDecision(ready,progress,replay,
    undefined,undefined,false,0,undefined,committed),committed);
  assert.equal(chooseLiveHeroDungeonDecision({...ready,health:1},progress,replay,
    undefined,undefined,false,0,undefined,committed).action,"shop");
  assert.equal(chooseLiveHeroDungeonDecision(ready,progress,{...replay,outcome:"retreat"},
    undefined,undefined,false,0,undefined,committed).action,"shop");
});

test("deep prepared expeditions carry more salvage but real resupply still wins",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="tank")!;
  const hero={...source,level:5,xp:400,floor:5 as const,status:"exploring" as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:heroProgression({...source,level:5}).maxHealth,
    traits:{...source.traits,positive:"brave",negative:"stubborn"},
    inventory:{bread:2,healing:1,finds:{"iron-ore":4}}};
  const layout=generateExpeditionLayout(7351,5);
  const progress={heroId:hero.id,...layout.entrance,
    visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:5 as const,
    appearance:{role:hero.role,equipment:hero.equipment},
    steps:[{...layout.entrance,t:0,action:"treasure" as const,hp:hero.health}],
    encounters:[],outcome:"exploring" as const};
  assert.equal(salvageReturnThreshold(hero),8);
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay,
    undefined,undefined,false,3).action,"descend");
  const full={...hero,inventory:{...hero.inventory,finds:{"iron-ore":8}}};
  assert.equal(chooseLiveHeroDungeonDecision(full,progress,replay,
    undefined,undefined,false,7).action,"shop");
  assert.equal(chooseLiveHeroDungeonDecision(full,progress,replay,
    undefined,undefined,false,8).action,"descend");
  for(const tired of [{...hero,health:1},{...hero,inventory:{...hero.inventory,bread:0,healing:0}},
    {...hero,equipment:{weapon:null,armor:"Leather Vest"}}]){
    assert.equal(salvageReturnThreshold(tired),4);
    assert.equal(chooseLiveHeroDungeonDecision(tired,progress,replay,
      undefined,undefined,false,3).action,"shop");
  }
  assert.equal(salvageReturnThreshold({...hero,floor:1}),4);
  assert.equal(salvageReturnThreshold({...hero,traits:{...hero.traits,positive:"careful"}}),6);
  assert.equal(salvageReturnThreshold({...hero,traits:{...hero.traits,negative:"reckless"}}),10);
});

test("two real eligible Floor-9 explorers rendezvous, form a party and commit a physical descent",()=>{
  const seed=7351,base=createGameState(seed);
  const layout=generateExpeditionLayout(seed,9);
  const stair=dungeonDownStair(layout);
  const approach=dungeonNeighbors(layout,stair)[0];
  const known=layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i]);
  const ready=base.adventurers.slice(0,2).map(h=>({...h,
    floor:9 as const,status:"exploring" as const,bossPass:true,
    traits:{...h.traits,positive:"brave",negative:"reckless"},
    equipment:{weapon:h.role==="tank"?"Iron Sword":h.role==="DPS"?"Spear":"Staff",armor:"Leather Vest"},
    health:heroProgression(h).maxHealth,gold:30}));
  ready.sort((a,b)=>a.id.localeCompare(b.id));
  assert(ready.every(isBossExpeditionCandidate));
  const ids=ready.map(h=>h.id);
  const active=activateLiveDungeon({...base,
    adventurers:base.adventurers.map(h=>ready.find(m=>m.id===h.id)??{
      ...h,floor:"away" as const,status:"off-duty" as const,offDutyUntilTick:4800}),
    dungeonWorlds:[{floor:9 as const,world:{...emptySpatialDungeonWorld(),
      resolvedFeatureIds:layout.features.map(f=>f.id),
      heroes:[{heroId:ids[0],...stair,visited:known},
        {heroId:ids[1],...approach,visited:known}]}}],
  });
  const traces:DungeonDiagnostic[]=[];
  const store=new GameStore(active,entry=>traces.push(entry));
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal(store.state.liveDungeon.partyBossCombat,null);
  assert(traces.some(t=>t.stage==="boss-rendezvous"&&t.checks.visiblePeer));
  for(const id of ids){
    const pos=store.state.dungeonWorlds.find(w=>w.floor===9)!.world.heroes.find(h=>h.heroId===id)!;
    assert.deepEqual({x:pos.x,z:pos.z},stair);
  }
  const resumed=new GameStore(parseSave(JSON.stringify(createSave(store.state))));
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  resumed.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(store.state,resumed.state);
  assert(store.state.dungeonParties.some(p=>ids.every(id=>p.memberIds.includes(id))));
  assert(ids.every(id=>store.state.liveDungeon.plans.some(p=>p.heroId===id&&p.action==="descend")));
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  resumed.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(store.state,resumed.state);
  assert.deepEqual(store.state.liveDungeon.partyBossCombat?.heroIds,ids);
  assert(traces.some(t=>t.stage==="boss-crossing"&&t.checks.accepted));
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("full health without a real class weapon is not a permit to risk deep floors",()=>{
  const original=createGameState(7351).adventurers.find(h=>h.role==="tank")!;
  const layout=generateExpeditionLayout(7351,3);
  const known=layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i]);
  const hero={...original,floor:3 as const,status:"exploring" as const,
    equipment:{weapon:null,armor:null},health:heroProgression(original).maxHealth,
    traits:{...original.traits,positive:"brave",negative:"stubborn"},
    gold:2};
  const progress={heroId:hero.id,...layout.entrance,visited:known};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:3 as const,
    appearance:{role:hero.role,equipment:hero.equipment},steps:[],encounters:[],
    outcome:"exploring" as const};
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay).action,"ascend");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,equipment:{weapon:"Staff",armor:"Leather Vest"}},
    progress,replay).action,"ascend");
  const reward={...replay,steps:[{...layout.entrance,t:1,
    action:"treasure" as const,hp:hero.health}]};
  assert.equal(chooseLiveHeroDungeonDecision({...hero,gold:9},progress,reward).action,"shop");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,gold:9},progress,replay).action,"ascend",
    "Stale gold alone must not cause an endless failed shopping loop");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,equipment:{weapon:"Iron Sword",armor:null}},
    progress,replay).action,"ascend","A novice with only a weapon is still overextended on Floor 3");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,level:3,xp:200,
    equipment:{weapon:"Iron Sword",armor:null}},progress,replay).action,"descend");
});

test("old unsold salvage does not cause a new return after every additional drop",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="tank")!;
  const hero={...source,level:5,xp:400,floor:5 as const,status:"exploring" as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:heroProgression({...source,level:5}).maxHealth,
    traits:{...source.traits,positive:"brave",negative:"stubborn"},
    inventory:{bread:2,healing:1,finds:{"iron-ore":9}}};
  const layout=generateExpeditionLayout(7351,5);
  const progress={heroId:hero.id,...layout.entrance,
    visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:5 as const,
    appearance:{role:hero.role,equipment:hero.equipment},encounters:[],
    steps:[{...layout.entrance,t:1,action:"treasure" as const,hp:hero.health}],
    outcome:"exploring" as const};
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay,undefined,undefined,false,8).action,"descend");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,inventory:{...hero.inventory,finds:{"iron-ore":16}}},
    progress,replay,undefined,undefined,false,15).action,"shop");
  assert.equal(chooseLiveHeroDungeonDecision({...hero,health:1},progress,replay,
    undefined,undefined,false,8).action,"shop");
});

test("ordinary depth risk reflects experience and merchant supplies without altering the boss gate",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  const novice={...source,level:1,xp:0,floor:3 as const,status:"exploring" as const,
    health:heroProgression({...source,level:1}).maxHealth,
    equipment:{weapon:"Spear",armor:null},
    traits:{...source.traits,positive:"brave",negative:"stubborn"},
    inventory:{...source.inventory,bread:0,healing:0}};
  assert(!canRiskOrdinaryDescent(novice));
  const supplied={...novice,equipment:{weapon:"Spear",armor:"Leather Vest"},
    inventory:{...novice.inventory,healing:1}};
  assert(canRiskOrdinaryDescent(supplied));
  assert(!canRiskOrdinaryDescent({...supplied,health:1}));
  assert(canRiskOrdinaryDescent({...novice,level:3,xp:200}));
  assert(!canRiskOrdinaryDescent({...novice,equipment:{weapon:"Staff",armor:"Leather Vest"}}));
  assert(canRiskOrdinaryDescent({...novice,equipment:{weapon:"Forged Spear",armor:"Leather Vest"}}));
  assert(!canRiskOrdinaryDescent({...supplied,floor:9}));
  const layout=generateExpeditionLayout(7351,3);
  const progress={heroId:novice.id,...layout.entrance,visited:[layout.entrance.z*layout.width+layout.entrance.x]};
  const replay={version:1 as const,day:1,heroId:novice.id,floor:3 as const,
    appearance:{role:novice.role,equipment:novice.equipment},steps:[],encounters:[],
    outcome:"exploring" as const};
  assert.notEqual(chooseLiveHeroDungeonDecision(novice,progress,replay,
    undefined,undefined,false,0,undefined,{goal:"progress",action:"descend"}).action,"descend");
});

test("remembering a tile does not reveal a roaming monster behind a wall",()=>{
  const layout=generateExpeditionLayout(7351,3);
  const world=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const monster=world.monsters!.find(m=>!hasDungeonLineOfSight(layout,layout.entrance,m));
  assert(monster);
  const visited=layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i]);
  const known={heroId:"observer",...layout.entrance,visited};
  const isolated={...world,monsters:[monster]};
  assert.equal(selectKnownResourceSite(layout,known,isolated,"monster"),null);
  const adjacent=dungeonNeighbors(layout,monster)[0];
  assert(adjacent);
  const near={...known,...adjacent};
  assert.equal(selectKnownResourceSite(layout,near,isolated,"monster")?.id,monster.id);
  assert.equal(selectKnownResourceSite(layout,near,{...isolated,
    monsters:[{...monster,mode:"ENGAGED"}]},"monster"),null);
});

test("ordinary descent and destination risk agree at every intermediate floor boundary",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  for(const floor of [4,5,6,7] as const){
    // Exactly the previous off-by-one readiness: legal to depart under
    // the old rule but immediately too weak to stay at the destination.
    const novice={...source,level:floor-1,xp:(floor-2)*100,
      floor,status:"exploring" as const,equipment:{weapon:"Spear",armor:null},
      inventory:{bread:0,healing:0,finds:{}},gold:0,
      traits:{...source.traits,positive:"brave",negative:"stubborn"}};
    const decide=(hero:typeof novice|Omit<typeof novice,"floor">&{floor:5|6|7|8})=>{
      const ready={...hero,health:heroProgression(hero).maxHealth};
      const layout=generateExpeditionLayout(7351,ready.floor);
      return chooseLiveHeroDungeonDecision(ready,{heroId:ready.id,...layout.entrance,
        visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])},
        {version:1,day:1,heroId:ready.id,floor:ready.floor,
          appearance:{role:ready.role,equipment:ready.equipment},steps:[],
          encounters:[],outcome:"exploring"});
    };
    const destination=(floor+1) as 5|6|7|8;
    assert.equal(decide(novice).action,"stay","Underprepared hero farms the current floor");
    assert.equal(decide({...novice,floor:destination}).action,"ascend");
    const equipped={...novice,equipment:{weapon:"Spear",armor:"Leather Vest"}};
    assert.equal(decide(equipped).action,"descend","Actual purchased armor changes the decision");
    assert.notEqual(decide({...equipped,floor:destination}).action,"ascend",
      "Unchanged readiness must not immediately reject the destination");
    const experienced={...novice,level:floor,xp:(floor-1)*100};
    assert.equal(decide(experienced).action,"descend");
    assert.notEqual(decide({...experienced,floor:destination}).action,"ascend");
  }
});

test("a reckless unarmed novice can risk Floor 2 without immediately rejecting the same risk",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  const novice={...source,level:1,xp:0,floor:1 as const,status:"exploring" as const,
    equipment:{weapon:null,armor:null},inventory:{bread:0,healing:0,finds:{}},gold:0,
    health:heroProgression({...source,level:1}).maxHealth,
    traits:{...source.traits,positive:"brave",negative:"reckless"}};
  assert(canRiskOrdinaryDescent(novice));
  const arrived={...novice,floor:2 as const};
  const layout=generateExpeditionLayout(7351,2);
  const known={heroId:arrived.id,...layout.entrance,
    visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])};
  const replay={version:1 as const,day:1,heroId:arrived.id,floor:2 as const,
    appearance:{role:arrived.role,equipment:arrived.equipment},steps:[],encounters:[],
    outcome:"exploring" as const};
  assert.equal(chooseLiveHeroDungeonDecision(arrived,known,replay).action,"stay");
  assert(!canRiskOrdinaryDescent(arrived),"An unarmed hero cannot deliberately risk Floor 3");
  assert.equal(chooseLiveHeroDungeonDecision({...arrived,health:Math.floor(arrived.health*.8)},
    known,replay).action,"ascend","A real change in health can justify turning back");
});


test("unresolved recovery does not turn an unchanged injury into another immediate shop visit",()=>{
  const source=createGameState(7351).adventurers[0];
  for(const floor of [1,3] as const){
    const hero={...source,floor,status:"exploring" as const,
      health:Math.floor(heroProgression(source).maxHealth*.2),
      inventory:{bread:0,healing:0,finds:{}}};
    const layout=generateExpeditionLayout(7351,floor);
    const progress={heroId:hero.id,...layout.entrance,visited:[layout.entrance.z*layout.width+layout.entrance.x]};
    const replay={version:1 as const,day:1,heroId:hero.id,floor,
      appearance:{role:hero.role,equipment:hero.equipment},steps:[],encounters:[],
      outcome:"exploring" as const};
    const prior={goal:"caution" as const,action:floor===1?"stay" as const:"ascend" as const};
    const decide=(previousHealth:number,plan=prior)=>chooseLiveHeroDungeonDecision(
      hero,progress,replay,undefined,undefined,false,0,undefined,plan,true,previousHealth);
    assert.equal(decide(hero.health).action,prior.action);
    assert.equal(decide(hero.health+1).action,"shop","A genuinely new injury can justify treatment");
    assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay).action,"shop",
      "A first unserved injury still motivates a genuine shop visit");
    const loot={...replay,steps:[{...layout.entrance,t:1,action:"treasure" as const,hp:hero.health}]};
    assert.equal(chooseLiveHeroDungeonDecision(hero,progress,loot,undefined,undefined,
      false,0,undefined,prior,true,hero.health).action,"shop",
      "New resources can justify renewed shopping");
  }
});

test("a fully explored floor and old gold cannot repeatedly trigger an unavailable gear purchase",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  const hero={...source,floor:1 as const,status:"exploring" as const,
    gold:100,equipment:{weapon:null,armor:null}};
  const layout=generateExpeditionLayout(7351,1);
  const progress={heroId:hero.id,...layout.entrance,
    visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:1 as const,
    appearance:{role:hero.role,equipment:hero.equipment},encounters:[],
    outcome:"completed" as const,
    steps:[{...layout.entrance,t:1,action:"complete" as const,hp:hero.health}]};
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay).action,"stay");
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,{...replay,
    outcome:"exploring",steps:[{...layout.entrance,t:1,action:"treasure",hp:hero.health}]}).action,"shop");
});
test("real gear helps depth readiness without substituting for all deep-floor experience",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  const young={...source,level:4,xp:300,floor:7 as const,status:"exploring" as const,
    equipment:{weapon:"Forged Spear",armor:"Ghoul Leather Vest"},
    inventory:{bread:2,healing:2},
    traits:{...source.traits,positive:"brave",negative:"reckless"}};
  const ready={...young,health:heroProgression(young).maxHealth};
  assert(!canRiskOrdinaryDescent(ready),"Equipment alone does not justify Floor 8 at level 4");
  const veteran={...ready,level:6,xp:500,health:heroProgression({...ready,level:6}).maxHealth};
  assert(canRiskOrdinaryDescent(veteran));
  assert(!canRiskOrdinaryDescent({...veteran,health:1}));
  const arrived={...ready,floor:8 as const};
  const layout=generateExpeditionLayout(7351,8);
  const replay={version:1 as const,day:1,heroId:ready.id,floor:8 as const,
    appearance:{role:ready.role,equipment:ready.equipment},
    steps:[],encounters:[],outcome:"exploring" as const};
  assert.equal(chooseLiveHeroDungeonDecision(arrived,undefined,replay).action,"ascend",
    "The resident uses the same deep risk threshold as the prospective descender");
  assert.notEqual(chooseLiveHeroDungeonDecision({...veteran,floor:8},undefined,replay).action,"ascend");
});
test("a Floor-9 hero without a pass does not endlessly revisit for unchanged gold or knowledge",()=>{
  const source=createGameState(7351).adventurers.find(h=>h.role==="DPS")!;
  const hero={...source,floor:9 as const,status:"exploring" as const,bossPass:false,
    level:7,xp:600,gold:100,equipment:{weapon:"Forged Spear",armor:"Ghoul Leather Vest"}};
  const layout=generateExpeditionLayout(7351,9);
  const progress={heroId:hero.id,...layout.entrance,
    visited:layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i])};
  const replay={version:1 as const,day:1,heroId:hero.id,floor:9 as const,
    appearance:{role:hero.role,equipment:hero.equipment},
    steps:[],encounters:[],outcome:"completed" as const};
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,replay).action,"stay");
  assert.equal(chooseLiveHeroDungeonDecision(hero,progress,{...replay,
    outcome:"exploring",steps:[{...layout.entrance,t:1,action:"treasure",hp:hero.health}]}).action,"shop");
});


test("an actual late-night encounter survives bedtime, dawn and JSON reload",()=>{
  const initial=activeFightFixture().state;
  const start=WORLD_TICKS_PER_DAY-DUNGEON_STEP_INTERVAL_TICKS-LIVE_COMBAT_INTERVAL_TICKS;
  // Activate the actual scheduler just before the final movement tick,
  // rather than synthesizing a battle state or editing its clock identity.
  const a=new GameStore({...initial,
    worldClock:{...initial.worldClock,tick:start},
    shopTraffic:{...initial.shopTraffic,tick:start},
  });
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const battle=a.state.liveDungeon.combats[0];
  assert(battle,"late combat may no longer be suppressed by bedtime");
  const before=a.state.adventurers.find(h=>h.id===battle.heroIds[0])!;
  a.endDay();
  assert.equal(a.state.day,2);
  const ongoing=a.state.liveDungeon.combats.find(c=>c.heroIds.includes(before.id));
  assert(ongoing,"bedtime must not settle an unresolved battle");
  assert.equal(Math.round(ongoing.state.time*60),30);
  assert.equal(ongoing.frames.length,6);
  assert.deepEqual(a.state.adventurers.find(h=>h.id===before.id),before,
    "midnight cannot heal or reschedule an active fighter");
  const b=new GameStore(parseSave(JSON.stringify(createSave(a.state))));
  assert.deepEqual(a.state,b.state);
  a.advanceWorldTime(100);b.advanceWorldTime(100);
  assert.deepEqual(a.state,b.state,"same encounter must continue exactly after reload");
});


test("map pacing preserves world day and combat clock while allowing four times as many movement opportunities",async()=>{
  const {DUNGEON_STEP_SECONDS,MONSTER_STEP_SECONDS,MONSTER_STEP_TICKS}=await import("../../src/game/dungeonPacing.ts");
  const {WORLD_TICKS_PER_DAY,WORLD_TICK_SECONDS}=await import("../../src/game/worldClock.ts");
  assert.equal(DUNGEON_STEP_SECONDS,2.5);
  assert.equal(MONSTER_STEP_SECONDS,5);
  assert.equal(MONSTER_STEP_TICKS,2*DUNGEON_STEP_INTERVAL_TICKS);
  assert.equal(WORLD_TICKS_PER_DAY*WORLD_TICK_SECONDS,24*60);
  assert.equal(LIVE_COMBAT_INTERVAL_TICKS*WORLD_TICK_SECONDS,.5);
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  store.advanceWorldTime(49);
  assert.equal(store.state.liveDungeon.lastStepTick,0);
  store.advanceWorldTime(1);
  assert.equal(store.state.liveDungeon.lastStepTick,50);
  store.advanceWorldTime(150);
  assert.equal(store.state.liveDungeon.lastStepTick,200);
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(saved);
  store.advanceWorldTime(50);
  resumed.advanceWorldTime(50);
  assert.deepEqual(resumed.state,store.state);
});

test("a new encounter sharing an existing combat burst begins at age zero",()=>{
  const store=activeFightFixture();
  store.enableLiveDungeon();
  let overlappingArrival=false;
  for(let i=0;i<200;i++){
    const prior=new Set(store.state.liveDungeon.combats.map(f=>f.id));
    store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
    const live=store.state.liveDungeon;
    for(const fight of live.combats){
      const elapsed=(live.combatTick-fight.startedTick)*3;
      assert.equal(Math.round(fight.state.time*60),elapsed,
        "No encounter may consume combat time before its physical arrival.");
      if(fight.startedTick===live.combatTick){
        assert.equal(fight.state.time,0);
        assert.equal(fight.frames.length,1);
        if(prior.size>0&&!prior.has(fight.id))overlappingArrival=true;
      }
    }
  }
  assert(overlappingArrival,"The fixture exercises a new encounter arriving while another was active.");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});
