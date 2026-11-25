import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {activateLiveDungeon} from "../../src/game/liveDungeonRuntime.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld}
  from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld}
  from "../../src/game/dungeonMonsterWorld.ts";
import {chooseDungeonThreatReaction}
  from "../../src/game/dungeonThreatDecisions.ts";
import {willingToTravelTogether} from "../../src/game/dungeonParties.ts";

const seed=7351,layout=generateExpeditionLayout(seed,1);

function chasedStationaryHero():{
  store:GameStore;heroId:string;featureId:string;x:number;z:number;
}{
  const initial=createGameState(seed);
  const hero=initial.adventurers.find(h=>
    h.status==="exploring"&&h.floor===1);
  assert(hero);
  const generated=advanceDungeonMonsterWorld(
    emptySpatialDungeonWorld(),layout,1,0);
  const packs=generated.monsters??[];
  const pack=packs.find(m=>dungeonNeighbors(layout,m).some(p=>
    !packs.some(other=>other.id!==m.id&&other.x===p.x&&other.z===p.z)&&
    (p.x!==layout.entrance.x||p.z!==layout.entrance.z)));
  assert(pack);
  const target=dungeonNeighbors(layout,pack).find(p=>
    !packs.some(other=>other.id!==pack.id&&other.x===p.x&&other.z===p.z)&&
    (p.x!==layout.entrance.x||p.z!==layout.entrance.z));
  assert(target);
  const visited=[layout.entrance.z*layout.width+layout.entrance.x,
    target.z*layout.width+target.x];
  const world={...generated,heroes:[{
    heroId:hero.id,...target,visited,
  }],monsters:packs.map(monster=>monster.id===pack.id
    ?{...monster,mode:"CHASING" as const,target,
      targetHeroId:hero.id,lastKnown:target,lastSeenTick:0,lostSightChecks:0}
    :monster)};
  const seeded={...initial,dungeonWorlds:[{floor:1 as const,world}]};
  const enabled=activateLiveDungeon(seeded);
  // The hero stands still while the actual monster follows its 100-tick
  // clock. This is NOT a synthetic fight or manually injected encounter.
  const paused={...enabled,liveDungeon:{...enabled.liveDungeon,
    heroes:[{heroId:hero.id,steps:1,finished:true}]}};
  return {store:new GameStore(paused),heroId:hero.id,
    featureId:pack.id,x:target.x,z:target.z};
}

test("pursuing Ghoul crosses onto a stationary hero and starts exactly one true GroupCombat",()=>{
  const {store,heroId,featureId,x,z}=chasedStationaryHero();
  store.advanceWorldTime(50);
  assert.equal(store.state.liveDungeon.combats.filter(f=>
    f.encounter.featureId===featureId).length,0);
  store.advanceWorldTime(50);
  const fights=store.state.liveDungeon.combats.filter(f=>
    f.encounter.featureId===featureId);
  assert.equal(fights.length,1);
  const fight=fights[0];
  assert.deepEqual(fight.heroIds,[heroId]);
  assert.deepEqual([fight.encounter.x,fight.encounter.z],[x,z]);
  assert.equal(fight.startedTick,100);
  assert.equal(fight.frames.length,1);
  assert.equal(fight.state.time,0);
  assert.equal(fight.arrivals[0].steps.at(-1)?.action,"combat");
  const world=store.state.dungeonWorlds.find(w=>w.floor===1)!.world;
  assert.equal(world.monsters?.find(m=>m.id===featureId)?.mode,"ENGAGED");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),
    store.state);
});

test("stationary contact resumes deterministically and never creates duplicate fight/site rewards",()=>{
  const {store,featureId}=chasedStationaryHero();
  store.advanceWorldTime(100);
  const checkpoint=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(checkpoint);
  store.advanceWorldTime(610);
  resumed.advanceWorldTime(610);
  assert.deepEqual(store.state,resumed.state);
  const captures=store.state.events.filter(event=>
    event.dungeonReplay?.encounters.some(e=>e.featureId===featureId));
  assert(captures.length<=1,
    "each world Ghoul pack may settle at most one physical combat encounter");
  assert.equal(new Set(store.state.liveDungeon.combats.map(f=>
    f.encounter.floor+":"+f.encounter.featureId)).size,
    store.state.liveDungeon.combats.length);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),
    store.state);
});

test("LIVE shop-bound hero reacts to a true visible pursuer without losing its committed return",()=>{
  const {store:seeded,heroId}=chasedStationaryHero();
  const state=seeded.state;
  const current=state.adventurers.find(h=>h.id===heroId)!;
  const hero={...current,health:Math.max(1,Math.floor(current.stats.maxHealth*.4))};
  const ready={...state,adventurers:state.adventurers.map(h=>
    h.id===heroId?hero:h),
    liveDungeon:{...state.liveDungeon,heroes:[],
      returns:[{heroId,fromFloor:1 as const,startedTick:0,
        phase:"backtrack" as const}]}};
  const before=ready.dungeonWorlds.find(w=>w.floor===1)!.world;
  const expected=chooseDungeonThreatReaction(layout,before,[hero],
    ready.adventurers);
  assert(expected&&expected.action==="ESCAPING");
  const old=before.heroes.find(h=>h.heroId===heroId)!;
  const store=new GameStore(ready);
  store.advanceWorldTime(50);
  const after=store.state;
  const journey=after.liveDungeon.returns.find(r=>r.heroId===heroId);
  assert(journey,"a tactical dodge must not cancel the actual shop-bound journey");
  const progress=after.dungeonWorlds.find(w=>w.floor===1)!.world.heroes
    .find(h=>h.heroId===heroId);
  assert(progress);
  assert.deepEqual({x:progress.x,z:progress.z},expected.step);
  assert(dungeonNeighbors(layout,old).some(p=>
    p.x===progress.x&&p.z===progress.z),"the evasive step is one real tile");
  assert.deepEqual(parseSave(JSON.stringify(createSave(after))),after);
});

test("co-located voluntary Temporary Party shares ONE physical Ghoul contact fight",()=>{
  const initial=createGameState(seed);
  const party=initial.adventurers.filter(h=>
    h.status==="exploring"&&h.floor===1&&willingToTravelTogether(h))
    .slice(0,2);
  assert.equal(party.length,2,"fixture requires two genuinely willing explorers");
  const initialWorld=advanceDungeonMonsterWorld(
    emptySpatialDungeonWorld(),layout,1,0);
  const packs=initialWorld.monsters??[];
  const pack=packs.find(m=>dungeonNeighbors(layout,m).some(at=>
    !packs.some(other=>other.id!==m.id&&other.x===at.x&&other.z===at.z)&&
    (at.x!==layout.entrance.x||at.z!==layout.entrance.z)));
  assert(pack);
  const at=dungeonNeighbors(layout,pack).find(point=>
    !packs.some(m=>m.id!==pack.id&&m.x===point.x&&m.z===point.z)&&
    (point.x!==layout.entrance.x||point.z!==layout.entrance.z));
  assert(at);
  const visits=[layout.entrance.z*layout.width+layout.entrance.x,
    at.z*layout.width+at.x];
  const world={...initialWorld,
    heroes:party.map(h=>({heroId:h.id,...at,visited:[...visits]})),
    monsters:packs.map(m=>m.id===pack.id?{
      ...m,mode:"CHASING" as const,target:at,targetHeroId:party[0].id,
      lastKnown:at,lastSeenTick:0,lostSightChecks:0,
    }:m)};
  const seeded=activateLiveDungeon({...initial,
    dungeonWorlds:[{floor:1 as const,world}],
    dungeonParties:[{memberIds:party.map(h=>h.id),floor:1 as const,
      formedDay:1}],
  });
  const paused={...seeded,liveDungeon:{...seeded.liveDungeon,
    heroes:party.map(h=>({heroId:h.id,steps:1,finished:true}))}};
  const store=new GameStore(paused);
  store.advanceWorldTime(50);
  assert(store.state.dungeonParties.some(p=>
    p.memberIds.length===2&&party.every(h=>p.memberIds.includes(h.id))),
    "a stationary eligible Temporary Party remains saved until collision");
  store.advanceWorldTime(50);
  const fights=store.state.liveDungeon.combats.filter(c=>
    c.encounter.featureId===pack.id);
  assert.equal(fights.length,1,
    "one Ghoul pack must never spawn separate battles per co-located hero");
  assert.deepEqual(fights[0].heroIds,party.map(h=>h.id));
  assert.equal(fights[0].encounter.x,at.x);
  assert.equal(fights[0].encounter.z,at.z);
  assert.equal(fights[0].arrivals.length,2);
  assert.equal(fights[0].frames.length,1);
  assert.equal(store.state.dungeonWorlds.find(w=>w.floor===1)!.world.monsters
    ?.find(m=>m.id===pack.id)?.mode,"ENGAGED");
  const save=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(save);
  store.advanceWorldTime(600);
  resumed.advanceWorldTime(600);
  assert.deepEqual(resumed.state,store.state,
    "the single shared combat result must resume deterministically");
});

test("a real evasive movement saves its observed threat and resumes deterministically",()=>{
  const {store:seeded,heroId,featureId}=chasedStationaryHero();
  const state=seeded.state;
  const current=state.adventurers.find(h=>h.id===heroId)!;
  const weak={...current,equipment:{weapon:null,armor:null}};
  const active={...state,adventurers:state.adventurers.map(h=>h.id===heroId?weak:h),
    liveDungeon:{...state.liveDungeon,heroes:[]}};
  const store=new GameStore(active);
  store.advanceWorldTime(50);
  const memory=store.state.liveDungeon.plans.find(p=>p.heroId===heroId)?.threatMemory;
  assert(memory,"A real evasion must record the last seen threat");
  assert.equal(memory.monsterId,featureId);
  assert.equal(memory.seenTick,50);
  const saved=createSave(store.state);
  const invalid=structuredClone(saved);
  const forged=invalid.payload.liveDungeon.plans.find(p=>p.heroId===heroId)!.threatMemory!;
  (forged as {seenTick:number}).seenTick=store.state.worldClock.tick+1;
  assert.throws(()=>parseSave(JSON.stringify(invalid)),/threatMemory/);
  const resumed=new GameStore(parseSave(JSON.stringify(saved)));
  store.advanceWorldTime(100);
  resumed.advanceWorldTime(100);
  assert.deepEqual(resumed.state,store.state);
});
