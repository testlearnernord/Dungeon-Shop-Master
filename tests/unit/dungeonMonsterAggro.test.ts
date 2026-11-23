import test from "node:test";
import assert from "node:assert/strict";
import {generateExpeditionLayout,dungeonNeighbors,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {hasDungeonLineOfSight} from "../../src/game/heroPerception.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld,MONSTER_SIGHT_RADIUS}
  from "../../src/game/dungeonMonsterWorld.ts";

const seed=7351,layout=generateExpeditionLayout(seed,1);
const empty=emptySpatialDungeonWorld();
const initial=advanceDungeonMonsterWorld(empty,layout,1,0);
const selected=initial.monsters!.find(pack=>
  dungeonNeighbors(layout,pack).length>0)!;
const heroId=createGameState(seed).adventurers[0].id;

test("a Ghoul sees a real nearby hero and drops its own roaming goal",()=>{
  const neighbor=dungeonNeighbors(layout,selected)[0];
  const roaming={...selected,mode:"ROAMING" as const,
    target:{x:selected.homeX,z:selected.homeZ}};
  const world={...initial,monsters:initial.monsters!.map(m=>
    m.id===selected.id?roaming:m)};
  const seen=advanceDungeonMonsterWorld(world,layout,1,200,
    [{...neighbor,heroId}]);
  const pack=seen.monsters!.find(m=>m.id===selected.id)!;
  assert.equal(pack.mode,"CHASING");
  assert.equal(pack.targetHeroId,heroId);
  assert.deepEqual(pack.lastKnown,neighbor);
  assert.deepEqual(pack.target,neighbor);
  assert.equal(pack.lastSeenTick,200);
});

test("a wall within range prevents Ghoul detection",()=>{
  let pair:{monster:typeof selected;hero:{x:number;z:number}}|null=null;
  for(const monster of initial.monsters??[]){
    for(let z=1;z<layout.height-1;z++)for(let x=1;x<layout.width-1;x++){
      const hero={x,z};
      if(tileAt(layout,x,z)==="wall")continue;
      const distance=(hero.x-monster.x)**2+(hero.z-monster.z)**2;
      if(distance>MONSTER_SIGHT_RADIUS**2||distance<4)continue;
      if(!hasDungeonLineOfSight(layout,monster,hero,MONSTER_SIGHT_RADIUS)){
        pair={monster,hero};break;
      }
    }
    if(pair)break;
  }
  assert(pair,"A seeded dungeon must contain a genuine occluded nearby corridor");
  const world={...initial,monsters:[pair.monster]};
  const tick=advanceDungeonMonsterWorld(world,layout,1,200,
    [{...pair.hero,heroId}]);
  const pack=tick.monsters!.find(m=>m.id===pair.monster.id)!;
  assert.notEqual(pack.mode,"CHASING");
  assert.equal(pack.targetHeroId,undefined);
});

test("three consecutive blind checks stop pursuit of a hidden hero",()=>{
  const neighbor=dungeonNeighbors(layout,selected)[0];
  let world=advanceDungeonMonsterWorld(initial,layout,1,200,
    [{...neighbor,heroId}]);
  assert.equal(world.monsters!.find(m=>m.id===selected.id)!.mode,"CHASING");
  world=advanceDungeonMonsterWorld(world,layout,1,400);
  let pack=world.monsters!.find(m=>m.id===selected.id)!;
  assert.equal(pack.mode,"SEARCHING");
  assert.deepEqual(pack.lastKnown,neighbor);
  world=advanceDungeonMonsterWorld(world,layout,1,600);
  pack=world.monsters!.find(m=>m.id===selected.id)!;
  assert.equal(pack.mode,"SEARCHING");
  world=advanceDungeonMonsterWorld(world,layout,1,800);
  pack=world.monsters!.find(m=>m.id===selected.id)!;
  assert.equal(pack.mode,"RETURNING");
  assert.equal(pack.targetHeroId,undefined);
  assert.deepEqual(pack.target,{x:pack.homeX,z:pack.homeZ});
});

test("an observed target and last seen tile survive a strict save round-trip",()=>{
  const neighbor=dungeonNeighbors(layout,selected)[0];
  const world=advanceDungeonMonsterWorld(initial,layout,1,200,
    [{...neighbor,heroId}]);
  const state=createGameState(seed);
  const saved={...state,dungeonWorlds:[{floor:1 as const,world}]};
  assert.deepEqual(parseSave(JSON.stringify(createSave(saved))),saved);
  const forged=structuredClone(createSave(saved)) as any;
  const monster=forged.payload.dungeonWorlds[0].world.monsters
    .find((m:any)=>m.targetHeroId===heroId);
  assert(monster);
  monster.targetHeroId="unknown-ghost";
  assert.throws(()=>parseSave(JSON.stringify(forged)),/targetHeroId/);
});
