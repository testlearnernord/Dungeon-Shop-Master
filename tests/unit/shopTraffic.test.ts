import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay,SIMULATION_VERSION} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {validateShopTraffic,emptyShopTraffic,type ShopTrafficCheckpoint} from "../../src/game/shopTraffic.ts";
import {ShopServiceSpots} from "../../src/game/shopServiceSpots.ts";

function shopFixture(){
  const state=createGameState(98123);
  const hero=state.adventurers.find(person=>person.status==="at-shop");
  assert(hero,"Requires a living initial shop visitor");
  const checkpoint:ShopTrafficCheckpoint={
    day:1,tick:0,initialized:true,
    actors:[{
      heroId:hero.id,x:-3.6,z:2.75,yaw:0.42,slot:0,gateSide:"portal",
      phase:"browsing",shoppingPhase:"walking-to-restock-wait",
      shoppingReason:"unavailable",shoppingTargetSlot:null,checkoutQueueIndex:-1,
      route:[{x:-3.2,z:2.4},{x:-2.8,z:1.8}],waypoint:1,
      toQueue:true,intentKey:"saved-shop-plan-abc",targetIndex:0,
      wait:1.15,elapsed:2.3,blockedSeconds:0.65,
      routeProgress:{target:{x:-2.8,z:1.8},closest:1.1,stagnantSeconds:0.15},
      trafficReroutes:1,idleYieldCooldown:2.25,requestActive:false,roamLeg:0,
      restockSeconds:null,wishItem:"bread",walkSpeed:1.15,
      animationTime:3.42,performanceTime:4.13,browseSide:-1,
    }],
    claims:[{heroId:hero.id,role:"restock",point:{x:-2.8,z:1.8}}],
    shelfOwners:[],doorY:{portal:0.72},
  };
  return {state,heroId:hero.id,checkpoint};
}
test("exact traffic checkpoint survives strict campaign JSON and restores routes, waits and claims",()=>{
  const {state,checkpoint}=shopFixture();
  const store=new GameStore(state);
  const oldBank=store.state.shopEconomy.balance;
  store.commitShopTraffic(checkpoint);
  assert.equal(store.state.shopEconomy.balance,oldBank);
  const encoded=JSON.stringify(createSave(store.state));
  const loaded=parseSave(encoded);
  assert.deepEqual(loaded.shopTraffic,checkpoint);
  assert.deepEqual(loaded.worldClock,state.worldClock);
  assert.equal(loaded.events.filter(event=>event.type==="sale").length,
    state.events.filter(event=>event.type==="sale").length);
  assert.equal(SIMULATION_VERSION,45);
  assert.equal(loaded.shopTraffic.actors[0].route[1].z,1.8);
  assert.equal(loaded.shopTraffic.actors[0].routeProgress?.stagnantSeconds,0.15);
});

test("forged traffic actors, claims, routes, stale ticks and slots are rejected",()=>{
  const {state,checkpoint}=shopFixture();
  const valid={...state,shopTraffic:checkpoint};
  const raw=createSave(valid);
  const invalid=(mutate:(p:any)=>void,reason:RegExp)=>{
    const envelope=structuredClone(raw) as any;
    mutate(envelope.payload);
    assert.throws(()=>parseSave(JSON.stringify(envelope)),reason);
  };
  invalid(p=>{delete p.shopTraffic;},/shopTraffic/);
  invalid(p=>{p.shopTraffic.tick=1;},/shopTraffic/);
  invalid(p=>{p.shopTraffic.actors[0].x=Infinity;},/finite/);
  invalid(p=>{p.shopTraffic.actors[0].route[0].z=999;},/route/);
  invalid(p=>{p.shopTraffic.actors[0].waypoint=3;},/waypoint/);
  invalid(p=>{p.shopTraffic.actors[0].heroId="ghost";},/heroId/);
  invalid(p=>{p.shopTraffic.actors.push(p.shopTraffic.actors[0]);},/heroId/);
  invalid(p=>{p.shopTraffic.claims[0].heroId="ghost";},/claim/);
  invalid(p=>{p.shopTraffic.shelfOwners=[{shelfId:"shelf-404",heroId:checkpoint.actors[0].heroId}];},/shelf/);
  invalid(p=>{p.shopTraffic.actors[0].secret="ghost-product";},/unexpected/);
  invalid(p=>{p.shopTraffic.actors[0].wishItem="fake-product";},/wishItem/);
  assert.throws(()=>validateShopTraffic({...checkpoint,initialized:false},
    1,0,new Set([checkpoint.actors[0].heroId]),new Set()),/uninitialized/);
});

test("service claims roundtrip without recomputing routes or stealing another reservation",()=>{
  const {state,checkpoint,heroId}=shopFixture();
  const spots=new ShopServiceSpots();
  spots.restoreClaims(checkpoint.claims,checkpoint.shelfOwners,
    state.shopLayout,state.shopRoom);
  assert.deepEqual(spots.snapshot(),checkpoint.claims);
  assert.deepEqual(spots.snapshotShelfOwners(),[]);
  assert.equal(spots.claim(heroId)?.role,"restock");
  spots.release(heroId);
  assert.equal(spots.claim(heroId),null);
});

test("day sleep clears old physical visitors and starts a clean uninitialized tick",()=>{
  const {state,checkpoint}=shopFixture();
  const store=new GameStore({...state,shopTraffic:checkpoint});
  store.endDay();
  assert.equal(store.state.day,2);
  assert.equal(store.state.shopTraffic.initialized,false);
  assert.equal(store.state.shopTraffic.day,2);
  assert.equal(store.state.shopTraffic.tick,store.state.worldClock.tick);
  assert.deepEqual(store.state.shopTraffic.actors,[]);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),
    store.state);
});

test("new campaign starts with a uniquely typed, empty checkpoint",()=>{
  const state=createGameState();
  assert.deepEqual(state.shopTraffic,emptyShopTraffic(state.day,state.worldClock.tick));
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))).shopTraffic,
    state.shopTraffic);
});
