import assert from "node:assert/strict";
import test from "node:test";
import {createEconomy,type ItemId,type Slot} from "../../src/game/economy.ts";
import {describeShelfFocus,prioritizeShopService,
  type LiveServiceRequest} from "../../src/game/shopServiceFocus.ts";

const economy=createEconomy();
const shelf=(itemId:ItemId|null,quantity:number):Slot=>({
  id:"shelf-1-slot-2",shelfId:"shelf-1",index:1,
  itemId,quantity,capacity:5,
});

test("empty shelf tells the player exactly which stock and quantity can be used",()=>{
  const hint=describeShelfFocus(shelf(null,0),"bread",economy.bag,false);
  assert.equal(hint.title,"Empty shelf slot · 0/5");
  assert.match(hint.instruction,/Left-click: stock Waybread \(2 in bag\)/);
  assert.equal(hint.tone,"ready");
  assert.match(hint.instruction,/Shift\+left-click: fill slot/);
  const noBag=describeShelfFocus(shelf(null,0),"iron-sword",economy.bag,false);
  assert.match(noBag.instruction,/No Iron Sword in bag · B: Wholesale/);
  assert.equal(noBag.tone,"warning");
});

test("existing shelf tells which key to press, what is full, and why a cart locks it",()=>{
  const wrong=describeShelfFocus(shelf("healing-herb",3),"bread",economy.bag,false,["bread","healing-herb"]);
  assert.match(wrong.instruction,/Press 2 to select Healing Herb/);
  assert.equal(wrong.tone,"warning");
  const correct=describeShelfFocus(shelf("healing-herb",3),"healing-herb",
    economy.bag,false);
  assert.match(correct.instruction,/Left-click: stock Healing Herb/);
  assert.match(correct.instruction,/Right-click: remove one/);
  const full=describeShelfFocus(shelf("healing-herb",5),"healing-herb",
    economy.bag,false);
  assert.equal(full.tone,"blocked");
  assert.match(full.instruction,/Shelf full/);
  const locked=describeShelfFocus(shelf("healing-herb",0),"healing-herb",
    economy.bag,true);
  assert.equal(locked.tone,"blocked");
  assert.match(locked.instruction,/Reserved stock/);
  assert.doesNotMatch(locked.instruction,/Left-click/);
});

test("live service ranks timed stockouts independently of credit and expired requests",()=>{
  const requests:LiveServiceRequest[]=[
    {heroId:"b",itemId:"bread",reason:"unavailable",secondsRemaining:34.2},
    {heroId:"c",itemId:"iron-sword",reason:"cannot-afford",secondsRemaining:3},
    {heroId:"a",itemId:"healing-herb",reason:"unavailable",secondsRemaining:15.2},
    {heroId:"expired",itemId:"bread",reason:"unavailable",secondsRemaining:0},
  ];
  const first=prioritizeShopService(requests);
  assert.deepEqual(first,{restock:requests[2],restockCount:2,creditCount:1});
  assert.deepEqual(prioritizeShopService([
    requests[1],requests[3],
  ]),{restock:null,restockCount:0,creditCount:1});
  assert.deepEqual(prioritizeShopService([]),{
    restock:null,restockCount:0,creditCount:0,
  });
  assert.equal(requests.length,4,"computing a display priority must not mutate the source");
});

test("equal deadlines preserve stable choice and reject non-finite timing",()=>{
  const tie:LiveServiceRequest[]=[
    {heroId:"visitor-z",itemId:"bread",reason:"unavailable",secondsRemaining:15},
    {heroId:"visitor-a",itemId:"iron-ore",reason:"unavailable",secondsRemaining:15},
    {heroId:"bad",itemId:"bread",reason:"unavailable",secondsRemaining:Infinity},
  ];
  assert.equal(prioritizeShopService(tie).restock?.heroId,"visitor-a");
  assert.equal(prioritizeShopService(tie).restockCount,2);
});

test("empty and unbound slots do not advertise a phantom product or fixed key",()=>{
  assert.match(describeShelfFocus(shelf(null,0),null,economy.bag,false).instruction,/TAB/);
  assert.match(describeShelfFocus(shelf("forged-spear",1),null,economy.bag,false).instruction,/Right-click: remove/);
  assert.match(describeShelfFocus(shelf(null,0),"forged-spear",economy.bag,false).instruction,/Forge in cellar/);
});
