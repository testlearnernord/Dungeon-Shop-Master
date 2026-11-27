import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay,type GameState} from "../../src/game/gameState.ts";
import {summarizeLedger} from "../../src/merchantLedger.ts";
import {ITEMS,ECONOMY,type ItemId} from "../../src/game/economy.ts";
import {buybackAtChest,availableChestMaterials,dungeonBuybackPrice,wantsChestBuyback}
  from "../../src/game/dungeonBuyback.ts";
import {BUYBACK_DOCK} from "../../src/game/buybackChestPlacement.ts";
import {serializeSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {dungeonRoomPurposeAt,dungeonRoomPurposes} from "../../src/game/dungeonRoomPurpose.ts";
import {advanceSpatialDungeonPartyStep,emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {distributeDungeonFinds,rollDungeonSiteLoot,rollDungeonTreasureLoot}
  from "../../src/game/dungeonLoot.ts";

function stockedHero():GameState {
  const base=createGameState(7351);
  const id=base.adventurers[0].id;
  return {...base,adventurers:base.adventurers.map(hero=>hero.id!==id?hero:{
    ...hero,status:"at-shop" as const,floor:"shop" as const,
    health:hero.stats.maxHealth,
    inventory:{...hero.inventory,finds:{"iron-ore":2,"coal":1}},
  })};
}

test("one physical drop-off transfers real materials and gold once",()=>{
  const before=stockedHero(),id=before.adventurers[0].id;
  assert.equal(availableChestMaterials(before,id).length,2);
  const after=buybackAtChest(before,id,BUYBACK_DOCK);
  assert.notEqual(after,before);
  assert.equal(before.adventurers[0].inventory.finds?.["iron-ore"],2);
  assert.equal(after.adventurers[0].gold,before.adventurers[0].gold+6);
  assert.equal(after.shopEconomy.balance,before.shopEconomy.balance-6);
  assert.deepEqual(after.shopEconomy.materialStorage,{"iron-ore":2,coal:1,"ghoul-leather":0});
  assert.deepEqual(after.shopEconomy.bag,before.shopEconomy.bag);
  const receipts=after.events.slice(before.events.length);
  assert.equal(receipts.length,3);
  assert.equal(new Set(receipts.map(e=>e.id)).size,3);
  assert(receipts.every(e=>e.type==="hero-buyback"&&e.quantity===1&&e.cost===2));
  assert.strictEqual(buybackAtChest(after,id,BUYBACK_DOCK),after);
  assert.deepEqual(parseSave(serializeSave(after)),after);
});
test("merchant ledger keeps material purchases separate from revenue",()=>{
  const state=stockedHero(),id=state.adventurers[0].id;
  const purchased=buybackAtChest(state,id,BUYBACK_DOCK);
  const summary=summarizeLedger(purchased,advanceDay(purchased).state);
  assert.equal(summary.buybacks.length,3);
  assert.equal(summary.buybackCost,2*dungeonBuybackPrice("iron-ore")+dungeonBuybackPrice("coal"));
  assert(summary.buybacks.every(b=>summary.receipts.every(r=>r.id!==b.id)));
});
test("closed, remote, absent and unaffordable chest actions are no-ops",()=>{
  const base=stockedHero(),id=base.adventurers[0].id;
  const closed={...base,buybackChestOpen:false};
  const broke={...base,shopEconomy:{...base.shopEconomy,balance:0}};
  const absent:GameState={...base,adventurers:base.adventurers.map(h=>h.id===id?
    {...h,status:"exploring" as const,floor:1 as const}:h)};
  for(const state of [closed,broke,absent]){
    assert.equal(wantsChestBuyback(state,id),false);
    assert.strictEqual(buybackAtChest(state,id,BUYBACK_DOCK),state);
  }
  assert.strictEqual(buybackAtChest(base,id,{x:0,z:0}),base);
  assert.deepEqual(parseSave(serializeSave(closed)),closed);
});
test("partial payment leaves unpaid materials and all non-material finds owned",()=>{
  const base=stockedHero(),id=base.adventurers[0].id;
  const withHerb:GameState={...base,adventurers:base.adventurers.map(h=>h.id===id?
    {...h,inventory:{...h.inventory,finds:{...h.inventory.finds,"healing-herb":1}}}:h)};
  const bag=Object.fromEntries(ITEMS.map(item=>[item.id,item.id==="bread"?ECONOMY.bagCapacity:0])) as Record<ItemId,number>;
  const full={...withHerb,shopEconomy:{...withHerb.shopEconomy,bag}};
  const after=buybackAtChest(full,id,BUYBACK_DOCK);
  assert.equal(after.adventurers[0].inventory.finds?.["healing-herb"],1);
  assert.deepEqual(after.shopEconomy.bag,bag);
  const poor={...full,shopEconomy:{...full.shopEconomy,balance:2}};
  const partial=buybackAtChest(poor,id,BUYBACK_DOCK);
  assert.equal(partial.shopEconomy.balance,0);
  assert.equal(partial.adventurers[0].inventory.finds?.["iron-ore"],1);
  assert.equal(partial.adventurers[0].inventory.finds?.coal,1);
  assert.equal(partial.adventurers[0].inventory.finds?.["healing-herb"],1);
  assert.strictEqual(buybackAtChest(partial,id,BUYBACK_DOCK),partial);
});
test("site loot and multi-hero ownership are deterministic and never duplicate items",()=>{
  const roll=rollDungeonSiteLoot(7351,3,"crypt:site",0,"treasure");
  assert.deepEqual(roll,rollDungeonSiteLoot(7351,3,"crypt:site",0,"treasure"));
  assert.ok(roll.itemIds.length>=1&&roll.itemIds.length<=3);
  const heroes=createGameState(7351).adventurers.slice(0,3);
  const items:ItemId[]=["coal","iron-ore","coal","healing-herb"];
  const first=distributeDungeonFinds(heroes,items,"crypt:site",0);
  assert.deepEqual(first,distributeDungeonFinds(heroes,items,"crypt:site",0));
  const count=first.reduce((total,hero)=>total+
    Object.values(hero.inventory.finds??{}).reduce((n,q)=>n+(q??0),0),0);
  assert.equal(count+first.reduce((n,h)=>n+h.inventory.healing,0),items.length);
  assert.equal(heroes.every(hero=>hero.inventory.finds===undefined),true,
    "The supplied adventurer snapshot must remain untouched");
});


test("real vault and workshop contents share one room classification and bounded loot rolls",()=>{
  let workshops=0,vaults=0;
  for(const seed of [42,7351,9321,2026])for(const floor of [1,5,9]){
    const map=generateExpeditionLayout(seed,floor);
    assert.deepEqual(dungeonRoomPurposes(map),dungeonRoomPurposes(generateExpeditionLayout(seed,floor)));
    for(const f of map.features.filter(f=>f.kind==="treasure")){
      const theme=dungeonRoomPurposeAt(map,f);
      if(theme==="vault")vaults++;
      if(theme==="workshop")workshops++;
      for(let cycle=0;cycle<6;cycle++){
        const roll=rollDungeonTreasureLoot(seed,map,f,cycle);
        const ordinary=rollDungeonSiteLoot(seed,floor,f.id,cycle,"treasure");
        assert.deepEqual(roll,rollDungeonTreasureLoot(seed,map,f,cycle));
        assert(roll.itemIds.length>=1&&roll.itemIds.length<=3);
        if(theme==="vault")assert(roll.itemIds.length>=2);
        else if(theme==="workshop"){
          assert(["iron-ore","coal"].includes(roll.itemIds[0]));
          assert.equal(roll.itemIds.length,ordinary.itemIds.length);
        }else assert.deepEqual(roll,ordinary);
      }
    }
  }
  assert(vaults>0&&workshops>0);
});
test("workshop treasure settlement awards real owned salvage exactly once per site cycle",()=>{
  const seed=7351,floor=7;
  const map=generateExpeditionLayout(seed,floor);
  const feature=map.features.find(f=>f.kind==="treasure"&&dungeonRoomPurposeAt(map,f)==="workshop");
  assert(feature,"Seeded deep workshop must have a real treasure site");
  const at=dungeonNeighbors(map,feature).find(p=>!map.features.some(f=>f.x===p.x&&f.z===p.z));
  assert(at,"Choose an actual free adjacent approach so the return step cannot trigger another site");
  const base=createGameState(seed).adventurers[0];
  const hero={...base,floor:7 as const,status:"exploring" as const};
  const initial={...emptySpatialDungeonWorld(),heroes:[{
    heroId:hero.id,...at,visited:[at.z*map.width+at.x],
  }]};
  const expected=rollDungeonTreasureLoot(seed,map,feature,0);
  const once=advanceSpatialDungeonPartyStep([hero],initial,seed,2,
    new Set([hero.id]),{tacticalStep:feature});
  assert(once.world.resolvedFeatureIds.includes(feature.id));
  assert.equal(once.ticks[0].gainedLoot,1);
  const awarded=expected.itemIds[0];
  assert(["coal","iron-ore"].includes(awarded));
  assert((once.ticks[0].adventurer.inventory.finds?.[awarded]??0)>=1);
  const back=advanceSpatialDungeonPartyStep([once.ticks[0].adventurer],once.world,seed,2,
    new Set([hero.id]),{tacticalStep:at});
  const again=advanceSpatialDungeonPartyStep([back.ticks[0].adventurer],back.world,seed,2,
    new Set([hero.id]),{tacticalStep:feature});
  assert.equal(again.ticks[0].gainedLoot,0);
  assert(!again.ticks[0].replay.steps.some(s=>s.action==="treasure"&&s.featureId===feature.id));
  // Isolate the existing physical chest settlement using the actual awarded
  // inventory; no fixture-created materials. Travel itself is covered by
  // the existing LIVE and browser tests.
  const start=createGameState(seed);
  const returned={...again.ticks[0].adventurer,floor:"shop" as const,status:"at-shop" as const};
  const stocked={...start,adventurers:start.adventurers.map(h=>h.id===returned.id?returned:h),
    shopEconomy:{...start.shopEconomy,balance:100}};
  const sold=buybackAtChest(stocked,returned.id,BUYBACK_DOCK);
  assert(sold.shopEconomy.materialStorage[awarded as "coal"|"iron-ore"]>0);
  assert(sold.shopEconomy.balance<stocked.shopEconomy.balance);
  assert.equal(sold.adventurers.find(h=>h.id===returned.id)!.inventory.finds?.[awarded]??0,0);
  assert.strictEqual(buybackAtChest(sold,returned.id,BUYBACK_DOCK),sold);
});
