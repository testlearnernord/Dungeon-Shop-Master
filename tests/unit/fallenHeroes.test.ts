import test from "node:test";
import assert from "node:assert/strict";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath} from "../../src/game/dungeonLayout.ts";
import {advanceSpatialDungeonPartyStep,emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {recordFallenHeroes,recoverFallenAt} from "../../src/game/fallenHeroes.ts";
import {surveyorPlanSource,type SurveyorPlan} from "../../src/game/dungeonDiscovery.ts";
import {parseSave,serializeSave} from "../../src/game/campaignSave.ts";
import {liveFloorFeatureIdentity} from "../../src/game/liveFloorFeatureIdentity.ts";

function fixture(){
  const state=createGameState(7351),layout=generateExpeditionLayout(state.seed,1);
  const trap=layout.features.find(f=>f.kind==="trap"&&
    dungeonNeighbors(layout,f).some(p=>!layout.features.some(q=>q.x===p.x&&q.z===p.z)))!;
  const at=dungeonNeighbors(layout,trap).find(p=>!layout.features.some(q=>q.x===p.x&&q.z===p.z))!;
  const visited=[...new Set(dungeonShortestPath(layout,layout.entrance,at)
    .map(p=>p.z*layout.width+p.x).concat(layout.entrance.z*layout.width+layout.entrance.x,at.z*layout.width+at.x))];
  const hero={...state.adventurers[0],status:"exploring" as const,floor:1 as const,
    shopStayDays:0,health:1,equipment:{weapon:null,armor:null},gold:19,
    inventory:{bread:0,healing:0,finds:{"iron-ore":3}}};
  const world={...emptySpatialDungeonWorld(),heroes:[{heroId:hero.id,x:at.x,z:at.z,visited}]};
  const result=advanceSpatialDungeonPartyStep([hero],world,state.seed,1,
    new Set([hero.id]),{tacticalStep:trap});
  const dead=result.ticks[0].adventurer;
  assert.equal(dead.status,"dead");
  const fallen=recordFallenHeroes([],result,1);
  assert.deepEqual(fallen,[{heroId:hero.id,floor:1,x:trap.x,z:trap.z,day:1}]);
  return {state,trap,result,dead,fallen};
}

test("actual fatal trap leaves a permanent body independent of replay retention",()=>{
  const {state,result,dead,fallen}=fixture();
  assert.strictEqual(recordFallenHeroes(fallen,result,1),fallen);
  assert.equal(result.world.heroes.some(h=>h.heroId===dead.id),false);
  const saved:GameState={...state,fallenHeroes:fallen,
    adventurers:state.adventurers.map(h=>h.id===dead.id?dead:h),
    dungeonWorlds:[{floor:1,world:result.world}]};
  assert.deepEqual(parseSave(serializeSave(saved)),saved);
  const forged=JSON.parse(serializeSave(saved));
  forged.payload.fallenHeroes.push(forged.payload.fallenHeroes[0]);
  assert.throws(()=>parseSave(JSON.stringify(forged)),/fallenHeroes/);
  assert.notEqual(liveFloorFeatureIdentity({resolved:[]}),
    liveFloorFeatureIdentity({resolved:[],fallen}));
});

test("recovery requires the same physical tile, transfers existing ownership only once",()=>{
  const {state,trap,dead,fallen}=fixture();
  const hero={...state.adventurers[1],status:"exploring" as const,floor:1 as const,
    shopStayDays:0};
  const roster=new Map([[dead.id,dead],[hero.id,hero]]);
  const plan:SurveyorPlan={...surveyorPlanSource(state.seed),status:"carried",
    heroId:dead.id,cycle:0,foundDay:1};
  const distant=recoverFallenAt(fallen,roster,hero,{x:trap.x+1,z:trap.z},plan);
  assert.strictEqual(distant.hero,hero);assert.strictEqual(distant.plan,plan);
  const recovered=recoverFallenAt(fallen,roster,hero,trap,plan);
  assert.equal(recovered.hero.gold,hero.gold+dead.gold);
  assert.equal(recovered.hero.inventory.finds?.["iron-ore"],3);
  assert.equal(recovered.deceased[0].gold,0);
  assert.equal(recovered.deceased[0].inventory.finds?.["iron-ore"],undefined);
  assert.equal(recovered.plan?.heroId,hero.id);
  roster.set(dead.id,recovered.deceased[0]);
  const again=recoverFallenAt(fallen,roster,recovered.hero,trap,recovered.plan);
  assert.strictEqual(again.hero,recovered.hero);
  assert.strictEqual(again.plan,recovered.plan);
  assert.equal(again.deceased.length,0);
});
