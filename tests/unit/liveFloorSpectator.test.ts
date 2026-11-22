import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {selectLiveFloorSpectatorFrame,LIVE_SPECTATOR_FLOORS}
  from "../../src/game/liveFloorSpectator.ts";

test("LIVE Floor projection reads every actor's own committed location and knowledge",()=>{
  const base=createGameState(7351);
  const [a,b,c]=base.adventurers;
  const participants=[a,b,c].map(h=>({
    ...h,status:"exploring" as const,floor:1 as const,
  }));
  const state={...base,
    adventurers:base.adventurers.map(h=>participants.find(p=>p.id===h.id)??h),
    liveDungeon:{...base.liveDungeon,enabled:true},
    earlyDungeonWorlds:[{floor:1 as const,world:{
      resolvedFeatureIds:["already-saved"],
      heroes:[
        {heroId:a.id,x:4,z:6,visited:[9,10]},
        {heroId:b.id,x:4,z:6,visited:[10]},
        {heroId:c.id,x:9,z:7,visited:[33]},
      ],
    }}],
    dungeonParties:[{floor:1 as const,memberIds:[a.id,b.id],formedDay:1}],
  };
  const before=structuredClone(state);
  const view=selectLiveFloorSpectatorFrame(state,1)!;
  assert.equal(view.heroes.length,3);
  assert.deepEqual(view.heroes.map(h=>[h.x,h.z]),[[4,6],[4,6],[9,7]]);
  assert.deepEqual(view.heroes.map(h=>h.visited),[[9,10],[10],[33]]);
  assert.equal(view.heroes[0].partyId,view.heroes[1].partyId);
  assert.notEqual(view.heroes[2].partyId,view.heroes[0].partyId);
  assert.deepEqual(view.resolved,["already-saved"]);
  assert.deepEqual(state,before,"A floor camera must never mutate gameplay");
  assert.deepEqual(selectLiveFloorSpectatorFrame(state,1),view);
});

test("missing checkpoints remain unknown, combat stays on actual floor",()=>{
  const base=createGameState(7351);
  const hero=base.adventurers.find(h=>h.floor===1&&h.status==="exploring")!;
  const state={...base,liveDungeon:{...base.liveDungeon,enabled:true}};
  const view=selectLiveFloorSpectatorFrame(state,1)!;
  assert(!view.heroes.some(h=>h.id===hero.id),
    "No invented entrance position before the first committed checkpoint");
  assert.deepEqual(view.fights,[]);
  assert.equal(selectLiveFloorSpectatorFrame(base,1),null);
  assert.deepEqual(LIVE_SPECTATOR_FLOORS,[1,2,3,4,5,6,7,8,9]);
});


test("hero details expose saved gear, inventory and goals without invented intentions",()=>{
  const initial=createGameState(7351);
  const hero=initial.adventurers[0];
  const saved={
    ...initial,
    adventurers:initial.adventurers.map(h=>h.id===hero.id?{
      ...h,status:"exploring" as const,floor:1 as const,
      gold:23,inventory:{loot:2,bread:4,healing:1},
      equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    }:h),
    liveDungeon:{...initial.liveDungeon,enabled:true,
      plans:[{heroId:hero.id,floor:1 as const,goal:"resupply" as const,
        action:"shop" as const,updatedTick:600}]},
    earlyDungeonWorlds:[{floor:1 as const,world:{
      resolvedFeatureIds:[],heroes:[{
        heroId:hero.id,x:1,z:1,visited:[1,2],
      }],
    }}],
  };
  const before=structuredClone(saved);
  const view=selectLiveFloorSpectatorFrame(saved,1)!;
  const actor=view.heroes.find(h=>h.id===hero.id)!;
  assert.equal(actor.gold,23);
  assert.deepEqual(actor.inventory,{loot:2,bread:4,healing:1});
  assert.deepEqual(actor.equipment,{
    weapon:"Iron Sword",armor:"Leather Vest",
  });
  assert.equal(actor.goal,"resupply");
  assert.equal(actor.plannedAction,"shop");
  assert.equal(actor.activity,"exploring");
  assert.deepEqual(saved,before);
  const unplanned=selectLiveFloorSpectatorFrame(
    {...saved,liveDungeon:{...saved.liveDungeon,plans:[]}},1)!;
  assert.equal(unplanned.heroes.find(h=>h.id===hero.id)?.goal,null);
  assert.equal(unplanned.heroes.find(h=>h.id===hero.id)?.plannedAction,null);
});
