import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay,type GameState} from "../../src/game/gameState.ts";
import {summarizeLedger} from "../../src/merchantLedger.ts";
import {ITEMS,ECONOMY,type ItemId} from "../../src/game/economy.ts";
import {buyHeroDungeonFind,availableDungeonOffers,dungeonBuybackPrice}
  from "../../src/game/dungeonBuyback.ts";
import {serializeSave,parseSave} from "../../src/game/campaignSave.ts";
import {distributeDungeonFinds,rollDungeonSiteLoot}
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

test("buyback transfers one physical item and its gold exactly once per receipt",()=>{
  const before=stockedHero();
  const heroId=before.adventurers[0].id;
  const price=dungeonBuybackPrice("iron-ore");
  assert.equal(availableDungeonOffers(before).find(x=>x.itemId==="iron-ore")?.count,2);
  const first=buyHeroDungeonFind(before,heroId,"iron-ore");
  assert.notStrictEqual(first.state,before);
  assert.equal(before.adventurers[0].inventory.finds?.["iron-ore"],2,
    "A checkout must not mutate the original snapshot");
  assert.equal(first.state.adventurers[0].inventory.finds?.["iron-ore"],1);
  assert.equal(first.state.adventurers[0].gold,before.adventurers[0].gold+price);
  assert.equal(first.state.shopEconomy.balance,before.shopEconomy.balance-price);
  assert.equal(first.state.shopEconomy.materialStorage["iron-ore"],
    before.shopEconomy.materialStorage["iron-ore"]+1);
  assert.equal(first.state.shopEconomy.bag["iron-ore"],0);
  const receipt=first.state.events.at(-1)!;
  assert.equal(receipt.type,"hero-buyback");
  assert.equal(receipt.quantity,1);
  assert.equal(receipt.cost,price);
  assert.equal(receipt.itemId,"iron-ore");
  assert.equal(receipt.adventurerId,heroId);
  const second=buyHeroDungeonFind(first.state,heroId,"iron-ore");
  assert.notEqual(second.state.events.at(-1)!.id,receipt.id);
  assert.equal(second.state.adventurers[0].inventory.finds?.["iron-ore"],undefined);
  assert.equal(availableDungeonOffers(second.state).some(x=>
    x.heroId===heroId&&x.itemId==="iron-ore"),false);
  const third=buyHeroDungeonFind(second.state,heroId,"iron-ore");
  assert.strictEqual(third.state,second.state,
    "Replaying an exhausted offer must never mint an item or gold");
  const loaded=parseSave(serializeSave(second.state));
  assert.equal(loaded.shopEconomy.balance,second.state.shopEconomy.balance);
  assert.deepEqual(loaded.adventurers[0].inventory.finds,
    second.state.adventurers[0].inventory.finds);
  assert.equal(loaded.events.at(-1)?.id,second.state.events.at(-1)?.id);
});

test("merchant ledger records purchases as expenses, never as sales income",()=>{
  const state=stockedHero(),heroId=state.adventurers[0].id;
  const purchased=buyHeroDungeonFind(state,heroId,"iron-ore").state;
  const next=advanceDay(purchased).state;
  const summary=summarizeLedger(purchased,next);
  assert.equal(summary.buybacks.length,1);
  assert.equal(summary.buybackCost,dungeonBuybackPrice("iron-ore"));
  assert.equal(summary.buybacks[0].cost,summary.buybackCost);
  assert.ok(summary.receipts.every(receipt=>receipt.id!==summary.buybacks[0].id));
});

test("buyback cannot take an offer from a hero who is not actually at the shop",()=>{
  const before=stockedHero();
  const id=before.adventurers[0].id;
  const absent:GameState={...before,adventurers:before.adventurers.map(hero=>
    hero.id===id?{...hero,status:"exploring" as const,floor:1 as const}:hero)};
  assert.equal(availableDungeonOffers(absent).some(x=>x.heroId===id),false);
  assert.strictEqual(buyHeroDungeonFind(absent,id,"iron-ore").state,absent);
});

test("buyback rejects insufficient funds and a full inventory atomically",()=>{
  const before=stockedHero();
  const id=before.adventurers[0].id;
  const broke:GameState={...before,shopEconomy:{...before.shopEconomy,balance:0}};
  assert.strictEqual(buyHeroDungeonFind(broke,id,"coal").state,broke);
  const bag=Object.fromEntries(ITEMS.map(item=>[
    item.id,item.id==="healing-herb"?ECONOMY.bagCapacity:0,
  ])) as Record<ItemId,number>;
  const full:GameState={...before,shopEconomy:{...before.shopEconomy,bag}};
  const boughtCoal=buyHeroDungeonFind(full,id,"coal");
  assert.notStrictEqual(boughtCoal.state,full,
    "Materials do not consume any shop bag capacity");
  assert.equal(boughtCoal.state.shopEconomy.materialStorage.coal,
    full.shopEconomy.materialStorage.coal+1);
  assert.equal(boughtCoal.state.shopEconomy.bag.coal,0);
  assert.equal(full.events.length,before.events.length);
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

test("shop bag full blocks recovered consumables but not forge materials",()=>{
  const base=stockedHero(),id=base.adventurers[0].id;
  const withHerb:GameState={...base,adventurers:base.adventurers.map(hero=>
    hero.id===id?{...hero,inventory:{...hero.inventory,
      finds:{...hero.inventory.finds,"healing-herb":1}}}:hero)};
  const bag=Object.fromEntries(ITEMS.map(item=>[
    item.id,item.id==="bread"?ECONOMY.bagCapacity:0,
  ])) as Record<ItemId,number>;
  const full={...withHerb,shopEconomy:{...withHerb.shopEconomy,bag}};
  assert.strictEqual(buyHeroDungeonFind(full,id,"healing-herb").state,full);
  const coal=buyHeroDungeonFind(full,id,"coal");
  assert.notStrictEqual(coal.state,full);
  assert.equal(coal.state.shopEconomy.bag.bread,ECONOMY.bagCapacity);
  assert.equal(coal.state.shopEconomy.materialStorage.coal,1);
  assert.equal(coal.state.shopEconomy.balance,
    full.shopEconomy.balance-dungeonBuybackPrice("coal"));
  assert.deepEqual(parseSave(serializeSave(coal.state)),coal.state);
});

test("physical chest buys real materials once, respects closed state, distance and treasury",async()=>{
  const {buybackAtChest}=await import("../../src/game/dungeonBuyback.ts");
  const {BUYBACK_DOCK}=await import("../../src/game/buybackChestPlacement.ts");
  const base=stockedHero(),id=base.adventurers[0].id;
  assert.equal(buybackAtChest({...base,buybackChestOpen:false},id,BUYBACK_DOCK).shopEconomy.balance,base.shopEconomy.balance);
  assert.strictEqual(buybackAtChest(base,id,{x:0,z:0}),base);
  const after=buybackAtChest(base,id,BUYBACK_DOCK);
  assert.equal(after.shopEconomy.materialStorage["iron-ore"],2);
  assert.equal(after.shopEconomy.materialStorage.coal,1);
  assert.equal(after.shopEconomy.balance,base.shopEconomy.balance-6);
  assert.equal(after.adventurers[0].gold,base.adventurers[0].gold+6);
  assert.strictEqual(buybackAtChest(after,id,BUYBACK_DOCK),after);
  const poor={...base,shopEconomy:{...base.shopEconomy,balance:2}};
  const partial=buybackAtChest(poor,id,BUYBACK_DOCK);
  assert.equal(partial.shopEconomy.balance,0);
  assert.equal(partial.adventurers[0].inventory.finds?.["iron-ore"],1);
  assert.deepEqual(parseSave(serializeSave({...after,buybackChestOpen:false})),{...after,buybackChestOpen:false});
});
