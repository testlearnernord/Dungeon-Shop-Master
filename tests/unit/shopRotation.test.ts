import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {useHealingSupplies} from "../../src/game/adventurers.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {walkOutWithoutPurchase} from "../../src/game/shopWalkout.ts";
import {scheduleShopVisit} from "../../src/game/shopArrivals.ts";
import {completeObservedShopExit,postShopRecoveryTicks}
  from "../../src/game/shopRotation.ts";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {selectLiveBoardHeroes} from "../../src/game/liveBoardProjection.ts";

function exitFixture(){
  const store=new GameStore(createGameState(7351));
  store.enableLiveDungeon();
  const hero=store.state.adventurers.find(h=>h.status==="at-shop")!;
  const leaving=walkOutWithoutPurchase(store.state,hero.id,"no-need");
  assert.equal(leaving.adventurers.find(h=>h.id===hero.id)?.status,"departing");
  return {state:leaving,hero};
}

test("shop departure is a committed outer-gate crossing, not an intent or a cashier click",()=>{
  const {state,hero}=exitFixture();
  assert.equal(postShopRecoveryTicks(hero),400);
  assert.strictEqual(completeObservedShopExit(state,hero.id,12.4),state);
  assert.strictEqual(completeObservedShopExit(state,"adventurer-999",13),state);
  assert.strictEqual(completeObservedShopExit(state,hero.id,NaN),state);
  assert.equal(state.events.filter(e=>e.type==="shop-departure").length,0);
  const after=completeObservedShopExit(state,hero.id,13);
  const departed=after.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(departed.status,"off-duty");
  assert.equal(departed.offDutyUntilTick,state.worldClock.tick+400);
  assert.equal(hero.lastShopExitTick,undefined);
  assert.equal(departed.lastShopExitTick,state.worldClock.tick);
  assert.deepEqual(departed.inventory,hero.inventory,"a free trip grants no goods");
  assert.equal(departed.gold,hero.gold);
  assert.equal(departed.health,hero.health);
  assert.equal(after.shopEconomy.balance,state.shopEconomy.balance);
  assert.equal(after.rngState,state.rngState,"exit does not reroll anything");
  const exits=after.events.filter(e=>e.type==="shop-departure"&&e.adventurerId===hero.id);
  assert.equal(exits.length,1);
  assert.equal(exits[0].worldTick,state.worldClock.tick);
  assert.strictEqual(completeObservedShopExit(after,hero.id,13),after,"cannot book twice");
  assert.deepEqual(parseSave(JSON.stringify(createSave(after))),after);
  const forged=structuredClone(createSave(after)) as any;
  forged.payload.adventurers.find((h:any)=>h.id===hero.id).lastShopExitTick=state.worldClock.tick+1;
  assert.throws(()=>parseSave(JSON.stringify(forged)),/lastShopExitTick/);
  const board=selectLiveBoardHeroes(after).find(h=>h.id===hero.id)!;
  assert.equal(board.status,"off-duty");
  assert.equal(board.visible,null,"remote hero health and inventory stay private");
  assert.equal(board.report?.eventId,exits[0].id);
});

test("recovery duration uses real injury and owned supplies",()=>{
  const {hero}=exitFixture(),max=hero.stats.maxHealth;
  assert.equal(postShopRecoveryTicks(hero),400);
  assert.equal(postShopRecoveryTicks({...hero,health:Math.floor(max*.8)}),1200);
  assert.equal(postShopRecoveryTicks({...hero,health:Math.floor(max*.5)}),4800);
  assert.equal(postShopRecoveryTicks({...hero,health:Math.floor(max*.5),
    inventory:{bread:0,healing:1}}),2400);
});
test("injured hero consumes one owned dose and resumes on the saved world clock",()=>{
  const {state,hero}=exitFixture();
  const injured={...state,adventurers:state.adventurers.map(h=>h.id===hero.id
    ?{...h,health:h.health-12,inventory:{...h.inventory,healing:2}}:h)};
  const exiting=completeObservedShopExit(injured,hero.id,13);
  const original=exiting.adventurers.find(h=>h.id===hero.id)!;
  const due=original.offDutyUntilTick!;
  const rested=useHealingSupplies(original,1,due).adventurer;
  const live=new GameStore(exiting);
  live.advanceWorldTime(due-1);
  assert.deepEqual(live.state.adventurers.find(h=>h.id===hero.id),original);
  const loaded=new GameStore(parseSave(JSON.stringify(createSave(live.state))));
  live.advanceWorldTime(1);loaded.advanceWorldTime(1);
  assert.deepEqual(live.state,loaded.state);
  const current=live.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(current.status,"exploring");
  assert.equal(current.floor,1);
  assert.equal(current.offDutyUntilTick,null);
  assert.equal(current.health,rested.health);
  assert.deepEqual(current.inventory,rested.inventory);
  assert.equal(current.gold,original.gold);
  assert.equal(live.state.events.filter(e=>e.type==="healed"&&e.adventurerId===hero.id).length,1);
  const pos=live.state.dungeonWorlds.find(w=>w.floor===1)?.world.heroes.find(h=>h.heroId===hero.id);
  assert(pos);
  assert.deepEqual({x:pos.x,z:pos.z},generateExpeditionLayout(injured.seed,1).entrance);
  assert.deepEqual(parseSave(JSON.stringify(createSave(live.state))),live.state);
});
test("recovery across midnight neither heals early nor restarts the saved deadline",()=>{
  const {state,hero}=exitFixture();
  const live=new GameStore(state);
  live.advanceWorldTime(28790);
  assert(live.completePhysicalShopExit(hero.id,13));
  const before=live.state.adventurers.find(h=>h.id===hero.id)!;
  assert(before.offDutyUntilTick!>28800);
  const resumed=new GameStore(parseSave(JSON.stringify(createSave(live.state))));
  live.endDay();resumed.endDay();
  assert.deepEqual(live.state,resumed.state);
  assert.deepEqual(live.state.adventurers.find(h=>h.id===hero.id),before);
  while(live.state.worldClock.tick<before.offDutyUntilTick!){
    live.advanceWorldTime(200);resumed.advanceWorldTime(200);
  }
  assert.deepEqual(live.state,resumed.state);
  const current=live.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(current.status,"exploring");
  assert.equal(current.offDutyUntilTick,null);
  assert.equal(current.health,before.health);
  assert.deepEqual(current.inventory,before.inventory);
  assert.deepEqual(parseSave(JSON.stringify(createSave(live.state))),live.state);
});

test("live night schedule does not invent a physical departure for a paid or unresolved shopper",()=>{
  const base=createGameState(7351);
  const hero=base.adventurers.find(h=>h.status==="at-shop")!;
  const staying={...hero,shopStayDays:1};
  const next=scheduleShopVisit(staying,2,100,true,true);
  assert.equal(next.adventurer.status,"departing");
  assert.equal(next.adventurer.floor,"shop");
  assert.deepEqual(next.events,[],"the real exit receives its own ticked event");
  assert.equal(next.rngState,100);
  const old=scheduleShopVisit(staying,2,100,true);
  assert.equal(old.adventurer.status,"returning",
    "isolated old bedtime fixtures retain their separate legacy flow");
});

test("severe injury spends additional owned doses on later recovery ticks, not on the same tick",()=>{
  const {state,hero}=exitFixture();
  const wounded={...hero,health:1,inventory:{...hero.inventory,bread:3,healing:0}};
  const before={...state,adventurers:state.adventurers.map(h=>h.id===hero.id?
    {...h,health:wounded.health,inventory:wounded.inventory}:h)};
  const exiting=completeObservedShopExit(before,hero.id,13);
  const store=new GameStore(exiting);
  const current=()=>store.state.adventurers.find(h=>h.id===hero.id)!;
  const first=current().offDutyUntilTick!;
  store.advanceWorldTime(first);
  assert.equal(current().health,9);
  assert.equal(current().inventory.bread,2);
  assert.equal(current().status,"off-duty");
  assert.equal(current().offDutyUntilTick,first+1200);
  const copy=new GameStore(parseSave(JSON.stringify(createSave(store.state))));
  store.advanceWorldTime(1200);copy.advanceWorldTime(1200);
  assert.deepEqual(copy.state,store.state);
  assert.equal(current().health,17);
  assert.equal(current().inventory.bread,1);
  const second=store.state.events.filter(e=>e.type==="healed"&&e.adventurerId===hero.id);
  assert.equal(second.length,2);
  assert.equal(new Set(second.map(e=>e.id)).size,2);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});
