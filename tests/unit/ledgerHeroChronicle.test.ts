import assert from "node:assert/strict";
import test from "node:test";
import {buildLedgerHeroChronicle} from "../../src/ledgerHeroChronicle.ts";
import {createGameState,advanceDay,type WorldEvent} from "../../src/game/gameState.ts";

test("ledger records a hero's known shop purchases, credit, and safe movement",()=>{
  const before=createGameState(7351);
  const id=before.adventurers[0].id;
  const after=advanceDay(before).state;
  const newEvents:WorldEvent[]=[
    {id:"day-2:"+id+":shop-departure",type:"shop-departure",day:2,
      adventurerId:id,message:"Left the shop"},
  ];
  const sales:WorldEvent[]=[
    {id:"day-1:"+id+":sale:shelf-1-slot-1",type:"sale",day:1,
      adventurerId:id,itemId:"bread",quantity:2,revenue:8,
      message:"Sold 2 Waybread"},
    {id:"day-1:"+id+":sale:shelf-1-slot-2",type:"sale",day:1,
      adventurerId:id,itemId:"healing-herb",quantity:1,revenue:6,
      message:"Sold one herb"},
  ];
  const credits:WorldEvent[]=[
    {id:"day-1:"+id+":shop-credit",type:"shop-credit",day:1,
      adventurerId:id,itemId:"bread",debtGold:4,message:"Issued on credit"},
  ];
  const result=buildLedgerHeroChronicle(before,after,sales,credits,newEvents);
  const row=result.lines.find(hero=>hero.id===id)!;
  assert(row);
  assert.equal(row.kind,"departed");
  assert.equal(row.label,"LEFT THE SHOP");
  assert.equal(row.paidGold,14);
  assert.equal(row.soldUnits,3);
  assert.deepEqual(row.goods,[{id:"bread",quantity:2},
    {id:"healing-herb",quantity:1}]);
  assert.equal(row.creditGold,4);
  assert.equal(row.portrait,0);
  assert.equal(result.knownShopVisitors,
    before.adventurers.filter(hero=>hero.status==="at-shop").length);
  assert.equal(result.payingHeroes,1);
});

test("sealed combat never leaks after-state death, loot, equipment, health or XP into the chronicle",()=>{
  const before=createGameState(7351);
  const id=before.adventurers[0].id;
  const afterBase=advanceDay(before).state;
  // Artificially change ALL the things hidden behind an unwatched replay.
  // The UI's safe projection must be identical for victory and defeat.
  const scenario=(outcome:"dead"|"expedition")=>{
    const after={...afterBase,adventurers:afterBase.adventurers.map(hero=>
      hero.id===id?{...hero,status:outcome as typeof hero.status,
        health:outcome==="dead"?0:hero.health,level:99,xp:9800,
        gold:999999,inventory:{...hero.inventory,loot:999}}:hero)};
    const events:WorldEvent[]=[{
      id:"sealed-record",type:"level6-combat",day:2,
      adventurerId:id,message:"Hidden combat outcome",
      combatOutcome:outcome==="dead"?"death":"victory",
      combatReplay:{} as NonNullable<WorldEvent["combatReplay"]>,
    }];
    return buildLedgerHeroChronicle(before,after,[],[],events);
  };
  const defeated=scenario("dead"),survived=scenario("expedition");
  assert.deepEqual(defeated,survived);
  const row=defeated.lines.find(hero=>hero.id===id)!;
  assert.equal(row.kind,"sealed");
  assert.equal(row.level,before.adventurers[0].level);
  assert.equal(row.paidGold,0);
  assert.equal(defeated.rememberedTotal,0);
  assert.equal(defeated.sealedRecords,1);
  assert(!JSON.stringify(defeated).includes("victory"));
  assert(!JSON.stringify(defeated).includes("death"));
});

test("skull memorials only include heroes confirmed dead before the night",()=>{
  const initial=createGameState(7351);
  const hero=initial.adventurers[0];
  const before={...initial,adventurers:initial.adventurers.map(h=>
    h.id===hero.id?{...h,health:0,status:"dead" as const}:h)};
  const after={...before,day:2};
  const result=buildLedgerHeroChronicle(before,after,[],[],[]);
  assert.equal(result.rememberedTotal,1);
  assert.equal(result.remembered[0].id,hero.id);
  assert.equal(result.remembered[0].kind,"fallen");
  assert(!result.lines.some(entry=>entry.id===hero.id));
});

test("hero chronicle is a pure projection of the closing boundary",()=>{
  const before=createGameState(7351);
  const after=advanceDay(before).state;
  const beforeSnapshot=JSON.stringify(before),afterSnapshot=JSON.stringify(after);
  const events=after.events.filter(e=>!before.events.some(prev=>prev.id===e.id));
  const a=buildLedgerHeroChronicle(before,after,[],[],events);
  const b=buildLedgerHeroChronicle(before,after,[],[],events);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(before),beforeSnapshot);
  assert.equal(JSON.stringify(after),afterSnapshot);
  assert(a.lines.length>=1);
});
