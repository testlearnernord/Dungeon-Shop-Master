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
  // The hero stands still while the actual monster follows its 400-tick
  // clock. This is NOT a synthetic fight or manually injected encounter.
  const paused={...enabled,liveDungeon:{...enabled.liveDungeon,
    heroes:[{heroId:hero.id,steps:1,finished:true}]}};
  return {store:new GameStore(paused),heroId:hero.id,
    featureId:pack.id,x:target.x,z:target.z};
}

test("pursuing Ghoul crosses onto a stationary hero and starts exactly one true GroupCombat",()=>{
  const {store,heroId,featureId,x,z}=chasedStationaryHero();
  store.advanceWorldTime(200);
  assert.equal(store.state.liveDungeon.combats.filter(f=>
    f.encounter.featureId===featureId).length,0);
  store.advanceWorldTime(200);
  const fights=store.state.liveDungeon.combats.filter(f=>
    f.encounter.featureId===featureId);
  assert.equal(fights.length,1);
  const fight=fights[0];
  assert.deepEqual(fight.heroIds,[heroId]);
  assert.deepEqual([fight.encounter.x,fight.encounter.z],[x,z]);
  assert.equal(fight.startedTick,400);
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
  store.advanceWorldTime(400);
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
