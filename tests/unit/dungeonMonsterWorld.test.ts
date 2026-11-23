import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {resolveDungeonSite} from "../../src/game/dungeonRegeneration.ts";
import {emptySpatialDungeonWorld}
  from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld,MONSTER_STEP_TICKS,
  type DungeonMonsterState} from "../../src/game/dungeonMonsterWorld.ts";

const seed=7351;
const floor=1;
const layout=generateExpeditionLayout(seed,floor);

test("world-clock packs roam rarely, only over real edges and at half hero speed",()=>{
  let world=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const start=world.monsters??[];
  assert(start.length>0);
  assert.equal(start.length,layout.features.filter(f=>f.kind==="monster").length);
  let moves=0,stationary=0;
  for(let tick=200;tick<=24000;tick+=200){
    const next=advanceDungeonMonsterWorld(world,layout,1,tick);
    for(const previous of world.monsters??[]){
      const current=next.monsters?.find(m=>m.id===previous.id);
      assert(current);
      const distance=Math.abs(previous.x-current.x)+Math.abs(previous.z-current.z);
      assert(distance<=1,"no monster may teleport across two cells");
      if(distance){
        moves++;
        assert.equal(tick%MONSTER_STEP_TICKS,0);
        assert.equal(current.lastMoveTick,tick);
        assert(dungeonNeighbors(layout,previous).some(p=>
          p.x===current.x&&p.z===current.z));
        assert.notEqual(tileAt(layout,current.x,current.z),"wall");
      }else stationary++;
    }
    world=next;
  }
  assert(moves>0,"a long unattended dungeon eventually produces real roaming");
  assert(stationary>moves*2,"Ghoul packs remain idle most of the time");
});

test("one saved pack cannot move before 400 ticks or through an occupied next tile",()=>{
  const initial=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const monster=initial.monsters![0];
  const target=dungeonNeighbors(layout,monster)[0];
  assert(target);
  const manual:DungeonMonsterState={...monster,mode:"ROAMING",target,
    nextDecisionTick:0,lastMoveTick:0};
  const world={...initial,monsters:[manual,...initial.monsters!.slice(1)]};
  const tooSoon=advanceDungeonMonsterWorld(world,layout,1,200);
  assert.deepEqual(tooSoon.monsters![0],manual);
  const blocked=advanceDungeonMonsterWorld(world,layout,1,400,[target]);
  assert.deepEqual(blocked.monsters![0],manual);
  const walking=advanceDungeonMonsterWorld(world,layout,1,400);
  assert.deepEqual([walking.monsters![0].x,walking.monsters![0].z],
    [target.x,target.z]);
  assert.equal(walking.monsters![0].lastMoveTick,400);
});

test("monster identity follows site generation; death removes the pack and regeneration resets it",()=>{
  const original=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const monster=original.monsters![0];
  const world={...original,
    resolvedFeatureIds:[monster.id],
    siteCycles:resolveDungeonSite([],monster.id,1)};
  const dead=advanceDungeonMonsterWorld(world,layout,1,400);
  assert(!dead.monsters?.some(m=>m.id===monster.id));
  const revived=advanceDungeonMonsterWorld(dead,layout,10,5000);
  const current=revived.monsters?.find(m=>m.id===monster.id);
  assert(current);
  assert.equal(current.siteCycle,1);
  assert.deepEqual([current.x,current.z],[monster.homeX,monster.homeZ]);
  assert.equal(current.mode,"IDLE");
});

test("full LIVE world saves every offscreen floor and resumes monster clocks deterministically",()=>{
  const first=new GameStore(createGameState(seed));
  first.enableLiveDungeon();
  first.advanceWorldTime(600);
  assert.equal(first.state.dungeonWorlds.length,9);
  assert(first.state.dungeonWorlds.every(f=>Array.isArray(f.world.monsters)));
  const snapshot=parseSave(JSON.stringify(createSave(first.state)));
  assert.deepEqual(snapshot,first.state);
  const second=new GameStore(snapshot);
  first.advanceWorldTime(800);
  second.advanceWorldTime(800);
  assert.deepEqual(second.state,first.state);
  const tampered=structuredClone(createSave(first.state)) as any;
  const pack=tampered.payload.dungeonWorlds[0].world.monsters[0];
  pack.x=-1;
  assert.throws(()=>parseSave(JSON.stringify(tampered)),/monsters/);
});
