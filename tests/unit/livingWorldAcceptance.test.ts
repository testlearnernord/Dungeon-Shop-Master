import assert from "node:assert/strict";
import test from "node:test";
import {createStockedShopState} from "./shopFixtures.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {selectExpeditionArchive,archiveAvailableDays} from "../../src/game/expeditionArchive.ts";
import {selectLiveBoardHeroes} from "../../src/game/liveBoardProjection.ts";
import {DUNGEON_STEP_INTERVAL_TICKS} from "../../src/game/liveDungeonRuntime.ts";
import {WORLD_TICKS_PER_DAY} from "../../src/game/worldClock.ts";
import type {GameState} from "../../src/game/gameState.ts";

/** A deliberately crowded but REAL source-of-truth campaign:
 * an unpaid petition, a funded shopper, two compatible explorers, a
 * genuinely lethal seeded trap and other autonomous adventurers.
 * Only the test fixture arranges the initial positions. Every subsequent
 * item transfer, death, party formation and tick uses gameplay code.
 */
function acceptanceFixture():{
  state:GameState;debtorId:string;buyerId:string;victimId:string;
  pairIds:readonly string[];
}{
  const base=createStockedShopState(7351,{dailyInflux:0,maxActive:10});
  const shop=base.adventurers.filter(h=>h.status==="at-shop");
  const crawlers=base.adventurers.filter(h=>h.status==="exploring");
  assert(shop.length>=2&&crawlers.length>=4);
  const [debtor,buyer]=shop;
  const [first,second,victim,fighter]=crawlers;
  const layout=generateExpeditionLayout(base.seed,1);
  const trap=layout.features.find(site=>site.kind==="trap"&&
    dungeonNeighbors(layout,site).some(pos=>
      pos.x!==layout.entrance.x||pos.z!==layout.entrance.z));
  assert(trap,"A real seeded Floor-1 trap is required");
  const approach=dungeonNeighbors(layout,trap).find(pos=>
    pos.x!==layout.entrance.x||pos.z!==layout.entrance.z)!;
  // A separate genuine monster site creates the authentic recorded tape.
  // The trap kill is only a witnessed magical death signal, NOT a video.
  const fightLayout=generateExpeditionLayout(base.seed,2);
  const monster=fightLayout.features.find(site=>site.kind==="monster"&&
    dungeonNeighbors(fightLayout,site).length>0);
  assert(monster,"A seeded real monster is required");
  const fightApproach=dungeonNeighbors(fightLayout,monster)[0];
  const monsterIndex=monster.z*fightLayout.width+monster.x;
  const trapIndex=trap.z*layout.width+trap.x;
  const entranceIndex=layout.entrance.z*layout.width+layout.entrance.x;
  const adventurers=base.adventurers.map(h=>{
    if(h.id===debtor.id)return {...h,gold:0,
      inventory:{...h.inventory,bread:0},
      equipment:{weapon:null,armor:null}};
    if(h.id===buyer.id)return {...h,gold:15,
      inventory:{...h.inventory,bread:0,healing:0}};
    if(h.id===first.id||h.id===second.id)return {...h,
      role:h.id===first.id?"healer" as const:"tank" as const,
      floor:1 as const,status:"exploring" as const,
      traits:{...h.traits,negative:"stubborn"}};
    if(h.id===victim.id)return {...h,health:1,
      floor:1 as const,status:"exploring" as const};
    if(h.id===fighter.id)return {...h,
      floor:2 as const,status:"exploring" as const};
    if(h.status==="exploring")return {...h,floor:4 as const};
    return h;
  });
  const world={...emptySpatialDungeonWorld(),
    resolvedFeatureIds:layout.features.filter(f=>f.id!==trap.id).map(f=>f.id),
    heroes:[
      ...[first.id,second.id].map(heroId=>({
        heroId,...layout.entrance,visited:[entranceIndex]})),
      {heroId:victim.id,...approach,visited:layout.tiles.flatMap((tile,i)=>
        tile!=="wall"&&i!==trapIndex?[i]:[])},
    ]};
  const fightWorld={...emptySpatialDungeonWorld(),
    resolvedFeatureIds:fightLayout.features.filter(f=>f.id!==monster.id)
      .map(f=>f.id),
    heroes:[{heroId:fighter.id,...fightApproach,
      visited:fightLayout.tiles.flatMap((tile,i)=>
        tile!=="wall"&&i!==monsterIndex?[i]:[])}],
  };
  return {state:{...base,adventurers,
      dungeonWorlds:[{floor:1 as const,world},
        {floor:2 as const,world:fightWorld}]},
    debtorId:debtor.id,buyerId:buyer.id,
    victimId:victim.id,pairIds:[first.id,second.id]};
}
const roundTrip=(state:GameState):GameState=>
  parseSave(JSON.stringify(createSave(state)));

test("ten live days: real credit, paid cart, death, parties, observed exits, reentry and pinned replay survive each reload",()=>{
  const fixture=acceptanceFixture();
  const store=new GameStore(fixture.state);
  store.enableLiveDungeon();
  const start=store.state;
  assert.deepEqual(roundTrip(start),start);
  const beforeCredit=start.shopEconomy.balance;
  const stock=start.shopEconomy.slots.find(s=>s.itemId==="bread")!.quantity;
  const debtMessage=store.issueShopCredit(fixture.debtorId);
  assert.match(debtMessage,/owes Galvik/);
  assert.equal(store.state.adventurers.find(h=>h.id===fixture.debtorId)?.status,
    "departing","Credit starts a physical exit, not a teleport to the dungeon");
  assert.equal(store.state.shopEconomy.balance,beforeCredit);
  assert.equal(store.state.shopDebts[0].outstandingGold,4);
  assert.equal(store.state.shopEconomy.slots.find(s=>s.id==="shelf-1-slot-2")?.quantity,
    stock-1);
  assert.equal(store.state.events.filter(e=>e.type==="sale").length,0);

  const plan=forecastShoppingIntents(store.state).get(fixture.buyerId);
  const line=plan?.items[0];
  assert(line,"A distinct funded customer must choose an actual stocked item");
  const beforeBuyer=store.state.adventurers.find(h=>h.id===fixture.buyerId)!;
  assert.match(store.pickUpShopItem(fixture.buyerId,line.slotId),/picked up/);
  assert.equal(store.state.shopEconomy.balance,beforeCredit,
    "Merely holding an item cannot pay Galvik");
  assert.equal(store.state.shopCarts.length,1);
  assert.match(store.payReservedCart(fixture.buyerId,false),/paid/);
  const bought=store.state.adventurers.find(h=>h.id===fixture.buyerId)!;
  assert.equal(beforeBuyer.gold-bought.gold,line.subtotal);
  assert.equal(store.state.shopEconomy.balance,beforeCredit+line.subtotal);
  assert.equal(store.state.shopCarts.length,0);
  assert.equal(store.state.events.filter(e=>e.type==="sale"&&
    e.saleChannel==="manual").length,1);
  assert.notDeepEqual(bought.inventory,beforeBuyer.inventory,
    "The actual purchased supply must reach that hero");
  assert.equal(store.completePhysicalShopExit(fixture.debtorId,13),true);
  assert.equal(store.completePhysicalShopExit(fixture.buyerId,13),true);
  assert.equal(store.completePhysicalShopExit(fixture.buyerId,13),false);
  assert.equal(store.state.events.filter(e=>e.type==="shop-departure").length,2);
  assert.deepEqual(roundTrip(store.state),store.state);

  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const firstDay=store.state;
  const signals=firstDay.events.filter(e=>e.type==="hero-death-signal"&&
    e.adventurerId===fixture.victimId);
  assert.equal(signals.length,1,
    "Actual trap collision, never a die roll or bedtime, kills the victim");
  assert.equal(signals[0].worldTick,DUNGEON_STEP_INTERVAL_TICKS);
  const projected=selectLiveBoardHeroes(firstDay)
    .find(h=>h.id===fixture.victimId)!;
  assert.equal(projected.status,"lost");
  assert.equal(projected.visible,null);
  assert(!/trap|floor|monster|loot|room/i.test(projected.report?.text??""),
    "The passive LIVE Board cannot spoil unseen dungeon details");
  const joined=firstDay.events.filter(e=>e.type==="temporary-party-join"&&
    fixture.pairIds.includes(e.adventurerId??""));
  assert.equal(joined.length,2,"A real common floor tile forms the Temporary Party");
  assert(firstDay.dungeonParties?.some(p=>
    fixture.pairIds.every(id=>p.memberIds.includes(id))));
  assert(firstDay.liveDungeon.combats.length>0,
    "The real seeded monster must launch a saved active group-combat motor");
  let fightTicks=0;
  while(store.state.liveDungeon.combats.length&&fightTicks++<100)
    store.advanceWorldTime(10);
  assert(fightTicks<100,"The real 60Hz monster battle must settle");
  const recording=store.state.events.find(e=>e.type==="dungeon-live"&&
    !!e.dungeonReplay?.encounters.length);
  assert(recording?.dungeonReplay,
    "Only a genuine completed fight owns immutable recorded footage");
  const originalTape=structuredClone(recording.dungeonReplay);
  assert.match(store.toggleSavedReplay(recording.id),/saved/);
  assert.deepEqual(roundTrip(store.state),store.state);

  const resumed=new GameStore(roundTrip(store.state));
  // Keep the reference run loaded continuously; the comparison run is
  // reconstructed from its exported strict save every single morning.
  const clearedShopGold=store.state.shopEconomy.balance;
  const savedDebt=store.state.shopDebts;
  for(let day=2;day<=11;day++){
    store.endDay();
    resumed.endDay();
    assert.equal(store.state.day,day);
    assert.equal(store.state.worldClock.tick,(day-1)*WORLD_TICKS_PER_DAY);
    assert.deepEqual(resumed.state,store.state,
      "Save/load must not change a real tick, fight, party or coin on Day "+day);
    const json=roundTrip(resumed.state);
    assert.deepEqual(json,resumed.state,"Strict v24 reparse on Day "+day);
    resumed.restore(json);
    assert.equal(store.state.shopEconomy.balance,clearedShopGold,
      "No invisible checkout or phantom sales at bedtime");
    assert.deepEqual(store.state.shopDebts,savedDebt,
      "Credit remains a debt, never a free cash sale");
    assert.equal(new Set(store.state.events.map(e=>e.id)).size,
      store.state.events.length,"No duplicated event identities");
    assert(store.state.adventurers.every(h=>h.health===0=== (h.status==="dead")));
    assert.equal(store.state.events.filter(e=>e.type==="hero-death-signal"&&
      e.adventurerId===fixture.victimId).length,1);
    assert(store.state.dungeonParties?.every(p=>
      p.memberIds.every(id=>store.state.adventurers.some(h=>h.id===id&&
        h.health>0&&h.floor===p.floor))),
      "No dead/off-duty hero can remain in a live party");
    for(const id of [fixture.debtorId,fixture.buyerId]){
      assert(store.state.events.some(e=>e.adventurerId===id&&e.day===1&&
        e.type==="dungeon-live"&&e.message.includes("began a new expedition")),
        "Initial physical exit must lead to a genuine same-day reentry");
      const hero=store.state.adventurers.find(h=>h.id===id)!;
      assert.equal(hero.offDutyUntilTick!==null,hero.status==="off-duty");
    }
    assert.deepEqual(archiveAvailableDays(day),
      Array.from({length:Math.min(day,3)},(_,i)=>day-i));
    assert.equal(selectExpeditionArchive(store.state,"saved").length,1);
    const savedEvent=store.state.events.find(e=>e.id===recording.id);
    assert.deepEqual(savedEvent?.dungeonReplay,originalTape,
      "Manually retained footage must never be re-simulated or expired");
  }
  assert.equal(store.state.events.filter(e=>e.type==="sale").length,1);
  assert.equal(store.state.events.filter(e=>e.type==="shop-credit").length,1);
  assert(store.state.events.some(e=>e.type==="temporary-party-join"));
  assert(store.state.events.some(e=>e.type==="temporary-party-leave")||
    (store.state.dungeonParties?.length??0)>0,
    "Real party relationships must remain visible or have an explicit split");
});
