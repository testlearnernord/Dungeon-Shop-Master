import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld}
  from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld}
  from "../../src/game/dungeonMonsterWorld.ts";

test("all nine ordinary floors survive sustained offscreen roaming and strict save/reload",()=>{
  for(const seed of [42,7351,9321]){
    const layouts=Array.from({length:9},(_,i)=>
      generateExpeditionLayout(seed,i+1));
    let worlds=layouts.map(layout=>
      advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),
        layout,1,0));
    let moved=0;
    const audit=(before:typeof worlds,after:typeof worlds,tick:number)=>{
      for(let i=0;i<layouts.length;i++){
        const layout=layouts[i];
        const packs=after[i].monsters??[];
        assert.equal(new Set(packs.map(m=>m.id)).size,packs.length,
          "each site generation owns just one monster identity");
        assert.equal(new Set(packs.map(m=>m.x+":"+m.z)).size,packs.length,
          "packs may never overlap, even on unobserved floors");
        for(const pack of packs){
          assert.notEqual(tileAt(layout,pack.x,pack.z),"wall");
          const old=before[i].monsters?.find(m=>m.id===pack.id);
          if(!old||old.siteCycle!==pack.siteCycle)continue;
          const delta=Math.abs(pack.x-old.x)+Math.abs(pack.z-old.z);
          assert(delta<=1,"offscreen monsters may move only one tile");
          if(delta){
            moved++;
            assert(tick-old.lastMoveTick>=100);
            assert(dungeonNeighbors(layout,old).some(p=>
              p.x===pack.x&&p.z===pack.z));
          }
        }
      }
    };
    for(let tick=50;tick<=4000;tick+=50){
      const next=worlds.map((world,i)=>
        advanceDungeonMonsterWorld(world,layouts[i],1,tick));
      audit(worlds,next,tick);worlds=next;
    }
    const saveState={...createGameState(seed),dungeonWorlds:
      worlds.map((world,i)=>({floor:(i+1) as 1,world}))};
    const restored=parseSave(JSON.stringify(createSave(saveState)));
    let reloaded=layouts.map((layout,i)=>
      restored.dungeonWorlds.find(entry=>entry.floor===layout.floor)!.world);
    assert.deepEqual(reloaded,worlds);
    for(let tick=4050;tick<=8000;tick+=50){
      const next=worlds.map((world,i)=>
        advanceDungeonMonsterWorld(world,layouts[i],1,tick));
      const fromSave=reloaded.map((world,i)=>
        advanceDungeonMonsterWorld(world,layouts[i],1,tick));
      assert.deepEqual(fromSave,next,
        "reload may not change any of the nine pack decisions or site cycles");
      audit(worlds,next,tick);
      worlds=next;reloaded=fromSave;
    }
    assert(moved>0,"a complete dungeon world must eventually show some roaming");
  }
});
