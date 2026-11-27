import test from "node:test";
import assert from "node:assert/strict";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {surveyorPlanSource,claimSurveyorPlan,SURVEYOR_PLAN_PRICE} from "../../src/game/dungeonDiscovery.ts";
import {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath} from "../../src/game/dungeonLayout.ts";
import {advanceSpatialDungeonPartyStep,emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {dungeonSiteCooldown} from "../../src/game/dungeonRegeneration.ts";
import {buybackAtChest,wantsChestBuyback} from "../../src/game/dungeonBuyback.ts";
import {BUYBACK_DOCK} from "../../src/game/buybackChestPlacement.ts";
import {serializeSave,parseSave} from "../../src/game/campaignSave.ts";
import {summarizeLedger} from "../../src/merchantLedger.ts";

function fixture(){
  const state=createGameState(7351),source=surveyorPlanSource(state.seed);
  const layout=generateExpeditionLayout(state.seed,source.floor);
  const feature=layout.features.find(f=>f.id===source.siteId)!;
  const at=dungeonNeighbors(layout,feature).find(p=>!layout.features.some(f=>f.x===p.x&&f.z===p.z))!;
  assert(at);
  const party=state.adventurers.slice(0,2).map(h=>({...h,status:"exploring" as const,
    floor:source.floor,shopStayDays:0}));
  const world={...emptySpatialDungeonWorld(),heroes:party.map(h=>({
    heroId:h.id,x:at.x,z:at.z,visited:[...new Set(dungeonShortestPath(layout,layout.entrance,at).map(p=>p.z*layout.width+p.x).concat(layout.entrance.z*layout.width+layout.entrance.x,at.z*layout.width+at.x))],
  }))};
  const result=advanceSpatialDungeonPartyStep(party,world,state.seed,1,
    new Set(party.map(h=>h.id)),{tacticalStep:feature});
  const plan=claimSurveyorPlan(null,state.seed,1,result,party);
  assert(plan);
  const settled:GameState={...state,surveyorPlan:plan,
    adventurers:state.adventurers.map(h=>result.ticks.find(t=>t.adventurer.id===h.id)?.adventurer??h),
    dungeonWorlds:[{floor:source.floor,world:result.world}]};
  return {state,source,layout,feature,at,party,result,plan,settled};
}

test("every sampled campaign has one deterministic connected deep discovery site",()=>{
  for(let seed=0;seed<48;seed++){
    const source=surveyorPlanSource(seed);
    assert.deepEqual(source,surveyorPlanSource(seed));
    const map=generateExpeditionLayout(seed,source.floor);
    const chest=map.features.find(f=>f.id===source.siteId);
    assert(chest?.kind==="treasure");
    assert(dungeonShortestPath(map,map.entrance,chest).length>0);
  }
});

test("one actual treasure contact claims one owner; dead owner requires later generation",()=>{
  const {state,source,layout,feature,at,party,result,plan}=fixture();
  assert.equal(plan.heroId,[...party].sort((a,b)=>a.id.localeCompare(b.id))[0].id);
  assert.equal(plan.status,"carried");
  assert.equal(plan.cycle,0);
  assert.strictEqual(claimSurveyorPlan(plan,state.seed,1,result,party),plan);
  const dead=party.map(h=>h.id===plan.heroId?{...h,health:0,status:"dead" as const}:h);
  assert.strictEqual(claimSurveyorPlan(plan,state.seed,1,result,dead),plan);
  const survivor=dead.find(h=>h.health>0)!;
  const day=1+dungeonSiteCooldown(layout,feature);
  const renewed=advanceSpatialDungeonPartyStep([survivor],{...result.world,
    heroes:[{heroId:survivor.id,x:at.x,z:at.z,visited:[...new Set(dungeonShortestPath(layout,layout.entrance,at).map(p=>p.z*layout.width+p.x).concat(layout.entrance.z*layout.width+layout.entrance.x,at.z*layout.width+at.x))]}]},
    state.seed,day,new Set([survivor.id]),{tacticalStep:feature});
  const recovered=claimSurveyorPlan(plan,state.seed,day,renewed,dead);
  assert(recovered);
  assert.equal(recovered.heroId,survivor.id);
  assert.equal(recovered.cycle,1);
  assert.equal(recovered.floor,source.floor);
  const purchased={...plan,status:"purchased" as const};
  assert.strictEqual(claimSurveyorPlan(purchased,state.seed,day,renewed,dead),purchased);
});

test("paid physical discovery unlocks expansion, conserves gold and validates save provenance",()=>{
  const {settled,plan}=fixture();
  assert.deepEqual(parseSave(serializeSave(settled)),settled);
  const store=new GameStore(settled);
  assert.equal(store.unlockShopExpansion(1),"Shop expansion unlocked.");
  assert.match(store.unlockShopExpansion(2),/Surveyor/);
  const atShop:GameState={...store.state,adventurers:store.state.adventurers.map(h=>h.id!==plan.heroId?h:{
    ...h,status:"at-shop",floor:"shop",inventory:{...h.inventory,finds:{}},
  }),shopEconomy:{...store.state.shopEconomy,balance:SURVEYOR_PLAN_PRICE}};
  const closed={...atShop,buybackChestOpen:false};
  const broke={...atShop,shopEconomy:{...atShop.shopEconomy,balance:SURVEYOR_PLAN_PRICE-1}};
  for(const unavailable of [closed,broke]){
    assert.equal(wantsChestBuyback(unavailable,plan.heroId),false);
    assert.strictEqual(buybackAtChest(unavailable,plan.heroId,BUYBACK_DOCK),unavailable);
  }
  assert.strictEqual(buybackAtChest(atShop,plan.heroId,{x:0,z:0}),atShop);
  const purchased=buybackAtChest(atShop,plan.heroId,BUYBACK_DOCK);
  assert.equal(purchased.surveyorPlan?.status,"purchased");
  assert.equal(purchased.shopEconomy.balance,0);
  assert.equal(purchased.adventurers.find(h=>h.id===plan.heroId)!.gold,
    atShop.adventurers.find(h=>h.id===plan.heroId)!.gold+SURVEYOR_PLAN_PRICE);
  assert.deepEqual(purchased.shopEconomy.materialStorage,atShop.shopEconomy.materialStorage);
  assert.equal(purchased.events.filter(e=>e.type==="discovery-buyback").length,1);
  assert.strictEqual(buybackAtChest(purchased,plan.heroId,BUYBACK_DOCK),purchased);
  const ledger=summarizeLedger(atShop,purchased);
  assert.equal(ledger.buybackCost,SURVEYOR_PLAN_PRICE);
  const expanded=new GameStore(purchased);
  assert.equal(expanded.unlockShopExpansion(2),"Shop expansion unlocked.");
  const saved=serializeSave(expanded.state);
  assert.deepEqual(parseSave(saved),expanded.state);
  const invalid=JSON.parse(saved);
  invalid.payload.surveyorPlan=null;
  assert.throws(()=>parseSave(JSON.stringify(invalid)),/surveyorPlan/);
  const forged=JSON.parse(saved);
  forged.payload.surveyorPlan.siteId="not-a-site";
  assert.throws(()=>parseSave(JSON.stringify(forged)),/surveyorPlan/);
});
