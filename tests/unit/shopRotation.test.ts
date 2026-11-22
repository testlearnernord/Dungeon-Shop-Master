import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {useHealingSupplies} from "../../src/game/adventurers.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {walkOutWithoutPurchase} from "../../src/game/shopWalkout.ts";
import {scheduleShopVisit} from "../../src/game/shopArrivals.ts";
import {completeObservedShopExit,POST_SHOP_OFF_DUTY_DAYS}
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
  assert.equal(POST_SHOP_OFF_DUTY_DAYS,2);
  assert.strictEqual(completeObservedShopExit(state,hero.id,12.4),state);
  assert.strictEqual(completeObservedShopExit(state,"adventurer-999",13),state);
  assert.strictEqual(completeObservedShopExit(state,hero.id,NaN),state);
  assert.equal(state.events.filter(e=>e.type==="shop-departure").length,0);
  const after=completeObservedShopExit(state,hero.id,13);
  const departed=after.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(departed.status,"off-duty");
  assert.equal(departed.offDutyUntilDay,4,"exit on Day 1 means whole Days 2 and 3 away");
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
  const board=selectLiveBoardHeroes(after).find(h=>h.id===hero.id)!;
  assert.equal(board.status,"off-duty");
  assert.equal(board.visible,null,"remote hero health and inventory stay private");
  assert.equal(board.report?.eventId,exits[0].id);
});

test("two FULL days outside preserve gear and gold, consume owned healing, then safely reenter",()=>{
  const {state,hero}=exitFixture();
  const exiting=completeObservedShopExit(state,hero.id,13);
  const injured={...exiting,adventurers:exiting.adventurers.map(h=>h.id===hero.id
    ?{...h,health:Math.max(1,h.health-12),inventory:{...h.inventory,healing:2}}
    :h)};
  const startHero=injured.adventurers.find(h=>h.id===hero.id)!;
  const rested=useHealingSupplies(startHero,2).adventurer;
  assert.equal(rested.health,startHero.stats.maxHealth);
  assert.equal(rested.inventory.healing,1);
  const uninterrupted=new GameStore(injured);
  const loaded=new GameStore(parseSave(JSON.stringify(createSave(injured))));
  for(const day of [2,3,4]){
    uninterrupted.endDay();
    loaded.endDay();
    assert.deepEqual(uninterrupted.state,loaded.state,"day "+day+" must reload deterministically");
    assert.equal(uninterrupted.state.day,day);
    const current=uninterrupted.state.adventurers.find(h=>h.id===hero.id)!;
    if(day<=3){
      assert.equal(current.status,"off-duty");
      assert.equal(current.health,rested.health);
      assert.deepEqual(current.inventory,rested.inventory,
        "actual off-duty healing spends one owned herb, never mints supplies");
      assert.equal(current.gold,startHero.gold);
      assert(!uninterrupted.state.liveDungeon.combats.some(f=>f.heroIds.includes(hero.id)));
    }else{
      assert.equal(current.status,"exploring");
      assert.equal(current.floor,1);
      assert.equal(current.offDutyUntilDay,null);
      assert.equal(current.health,rested.health);
      assert.deepEqual(current.inventory,rested.inventory);
      const layout=generateExpeditionLayout(injured.seed,1);
      const pos=uninterrupted.state.earlyDungeonWorlds?.find(w=>w.floor===1)?.world
        .heroes.find(h=>h.heroId===hero.id);
      assert(pos);
      assert.deepEqual({x:pos.x,z:pos.z},layout.entrance);
      assert(uninterrupted.state.events.some(e=>e.day===4&&e.type==="dungeon-live"&&
        e.adventurerId===hero.id&&e.message.includes("new expedition")));
    }
    assert.deepEqual(parseSave(JSON.stringify(createSave(uninterrupted.state))),
      uninterrupted.state,"save must stay strict on Day "+day);
  }
  assert.equal(uninterrupted.state.events.filter(e=>e.type==="shop-departure"&&
    e.adventurerId===hero.id).length,1);
  assert.equal(uninterrupted.state.events.filter(e=>e.type==="healed"&&
    e.adventurerId===hero.id).length,1,
    "one real herb use, no duplicated healing on the second off-duty day");
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
