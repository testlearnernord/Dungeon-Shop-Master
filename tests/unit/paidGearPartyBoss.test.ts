import assert from "node:assert/strict";
import test from "node:test";
import {createStockedShopState} from "./shopFixtures.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {createGroupCombat,stepGroupCombat,captureGroupCombatFrame}
  from "../../src/game/groupCombat.ts";

/** A deterministic *boundary* fixture: direct move to Floor 6 only sets
 * up an encounter. No invented portal, player navigation or free inventory.
 * Goods are bought, shelved and paid through the real merchant methods.
 */
test("physically purchased gear carries into the real Floor-10 GroupCombat hero",()=>{
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
  // Physically take stock off the real shelves. No hypothetical direct
  // checkout may award equipment without reserving those actual goods.
  assert.match(merchant.pickUpShopItem(first.id,"shelf-1-slot-1"),/picked up/);
  assert.match(merchant.pickUpShopItem(first.id,"shelf-1-slot-2"),/picked up/);
  const cart=merchant.state.shopCarts.find(c=>c.heroId===first.id)!;
  assert.deepEqual(new Set(cart.lines.map(line=>line.itemId)),
    new Set(["iron-sword","leather-vest"]));
  assert.equal(cart.lines.reduce((sum,line)=>sum+line.subtotal,0),17);
  assert.equal(merchant.state.shopEconomy.balance,stocked.shopEconomy.balance,
    "Picking up items is not a paid sale.");
  assert.match(merchant.payReservedCart(first.id),/paid 17g for 2 line/);
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
  assert.match(merchant.payReservedCart(first.id),/no payable cart/);
  assert.strictEqual(merchant.state,paid,"A paid cart cannot settle twice");
  assert.deepEqual(parseSave(JSON.stringify(createSave(paid))),paid);

  // This is a REAL deterministic party motor, not the removed solo
  // encounter. Live stair/party ownership is independently tested by
  // caveTrollPartyLive.test.ts, while this verifies the paid gear boundary.
  const prepare=(state:typeof paid)=>state.adventurers.slice(0,3).map(h=>({
    ...h,status:"expedition" as const,floor:10 as const,
    health:h.stats.maxHealth,bossPass:true,
  }));
  const gearedOptions=caveTrollPartyOptions(prepare(paid),42);
  const bareOptions=caveTrollPartyOptions(prepare(stocked),42);
  const geared=gearedOptions.actors.find(actor=>actor.id===first.id)!;
  const bare=bareOptions.actors.find(actor=>actor.id===first.id)!;
  assert.equal(geared.equipment?.weapon,"Iron Sword");
  assert.equal(geared.equipment?.armor,"Leather Vest");
  assert.equal(bare.equipment?.weapon,null);
  assert.equal(bare.equipment?.armor,null);
  assert(geared.damage>bare.damage);
  assert(geared.armor>bare.armor);
  assert.equal(gearedOptions.actors.filter(a=>a.team==="heroes").length,3);
  assert.equal(gearedOptions.actors.find(a=>a.id==="cave-troll")?.maxHp,700);
  const live=createGroupCombat(gearedOptions);
  const snapshot=captureGroupCombatFrame(live);
  for(let i=0;i<30;i++)stepGroupCombat(live);
  assert(Math.abs(live.time-0.5)<1e-6);
  assert.equal(snapshot.t,0);
  // Actor runtime intentionally stores combat stats rather than duplicating
  // full inventory. Equipment remains in the canonical saved encounter options.
  assert(gearedOptions.actors.some(a=>a.id===first.id&&
    a.equipment?.weapon==="Iron Sword"));
  assert.equal(live.actors.find(a=>a.id===first.id)?.armor,geared.armor);
  assert.equal(live.actors.find(a=>a.id===first.id)?.damage,geared.damage);
  const initialActor=createGroupCombat(gearedOptions).actors.find(a=>a.id===first.id)!;
  const recorded=snapshot.actors.find(a=>a.id===first.id)!;
  assert.equal(recorded.hp,initialActor.hp);
  assert.equal(recorded.x,initialActor.x);
  assert.equal(recorded.z,initialActor.z);
  assert.equal(recorded.phase,initialActor.phase);
  assert.equal(gearedOptions.actors.find(a=>a.id===first.id)?.equipment?.weapon,"Iron Sword");
});
