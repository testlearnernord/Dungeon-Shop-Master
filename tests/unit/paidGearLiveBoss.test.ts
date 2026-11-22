import assert from "node:assert/strict";
import test from "node:test";
import {createStockedShopState} from "./shopFixtures.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

/** A deterministic *boundary* fixture: direct move to Floor 6 only sets
 * up an encounter. No invented portal, player navigation or free inventory.
 * Goods are bought, shelved and paid through the real merchant methods.
 */
test("paid Iron Sword and Leather Vest follow one buyer into the authentic saved LIVE Troll",()=>{
  const initial=createStockedShopState(7351,{dailyInflux:0,maxActive:10});
  const first=initial.adventurers[0];
  const originalHero={
    ...first,status:"at-shop" as const,floor:5 as const,
    gold:100,health:first.stats.maxHealth,
    equipment:{weapon:null,armor:null},
    inventory:{...first.inventory,bread:2,healing:1},
  };
  const start={
    ...initial,
    adventurers:initial.adventurers.map(hero=>
      hero.id===first.id?originalHero:hero),
    shopEconomy:{...initial.shopEconomy,
      slots:initial.shopEconomy.slots.map(slot=>
        ({...slot,itemId:null,quantity:0}))},
  };
  const merchant=new GameStore(start);
  assert.match(merchant.purchase("iron-sword",1,1101),/Bought 1 Iron Sword/);
  assert.match(merchant.purchase("leather-vest",1,1102),/Bought 1 Leather Vest/);
  assert.match(merchant.transfer("shelf-1-slot-1","iron-sword","stock"),/Placed Iron Sword/);
  assert.match(merchant.transfer("shelf-1-slot-2","leather-vest","stock"),/Placed Leather Vest/);
  const stocked=merchant.state;
  assert.equal(stocked.shopEconomy.bag["iron-sword"],0);
  assert.equal(stocked.shopEconomy.bag["leather-vest"],0);
  const quote=merchant.quoteCheckout(first.id);
  assert(quote,"The buyer must receive a real eligible checkout quote");
  assert.deepEqual(new Set(quote.lines.map(line=>line.itemId)),
    new Set(["iron-sword","leather-vest"]));
  assert.equal(quote.total,17);
  assert.match(merchant.checkout(quote),/Paid 17g for 2 items/);
  const paid=merchant.state;
  const buyer=paid.adventurers.find(hero=>hero.id===first.id)!;
  assert.equal(buyer.equipment.weapon,"Iron Sword");
  assert.equal(buyer.equipment.armor,"Leather Vest");
  assert.equal(buyer.gold,originalHero.gold-17);
  assert.equal(paid.shopEconomy.balance,stocked.shopEconomy.balance+17);
  assert.equal(paid.shopEconomy.dailySales.revenue,17);
  assert.deepEqual(paid.events.filter(event=>
    event.type==="sale"&&event.adventurerId===buyer.id).map(event=>event.itemId).sort(),
    ["iron-sword","leather-vest"]);
  assert.match(merchant.checkout(quote),/already paid today/);
  assert.strictEqual(merchant.state,paid,"A paid cart cannot settle twice");
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);

  const enterBoss=(state:typeof paid)=>{
    const roster=state.adventurers.map(hero=>hero.id===first.id?{
      ...hero,status:"expedition" as const,floor:6 as const,
      level6Permit:true,
    }:hero);
    const store=new GameStore({...state,adventurers:roster});
    store.enableLiveDungeon();
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
    return store;
  };
  const equipped=enterBoss(paid);
  const control=enterBoss(stocked);
  const live=equipped.state.liveDungeon.bossCombat;
  const unarmed=control.state.liveDungeon.bossCombat;
  assert(live&&unarmed,"Both branches must enter a genuine saved LIVE boss");
  assert.equal(live.heroId,first.id);
  assert.equal(live.state.options.sword,true);
  assert.equal(live.state.options.armor,true);
  assert.equal(unarmed.state.options.sword,false);
  assert.equal(unarmed.state.options.armor,false);
  assert.equal(live.state.options.health,unarmed.state.options.health);
  assert.equal(live.state.outcome,"fighting");
  assert.equal(live.state.bossHp,280);
  assert.equal(live.frames.length,1);

  // Current-version Save/Reload must retain the paid gear and the same
  // authoritative 60Hz combat state, not synthesize a new fight.
  const resumed=new GameStore(parseSave(JSON.stringify(createSave(equipped.state))));
  equipped.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  resumed.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  assert.deepEqual(resumed.state,equipped.state);
  assert(Math.abs(equipped.state.liveDungeon.bossCombat!.state.time-0.5)<1e-6);
  assert.equal(equipped.state.adventurers.find(hero=>hero.id===first.id)!
    .equipment.weapon,"Iron Sword");
  assert.equal(equipped.state.adventurers.find(hero=>hero.id===first.id)!
    .equipment.armor,"Leather Vest");
});
