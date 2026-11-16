import assert from "node:assert/strict";
import test from "node:test";
import { customerBark, customerBarkPriority, type CustomerBarkKind } from "../../src/game/npcCustomerBarks.ts";

const kinds:CustomerBarkKind[]=[
  "restock","credit-request","pickup","paid",
  "credit-granted","unserved","refused","no-need",
];

test("customer barks are short, deterministic and anchored to real events",()=>{
  for(const kind of kinds){
    const event={heroId:"adventurer-3",role:"tank" as const,kind,
      itemId:"healing-herb" as const,gold:2};
    const first=customerBark(event);
    assert.equal(customerBark(event),first);
    assert(first.length>0 && first.length<=90,kind+" is too long for the shop");
    assert(!/died|will die|floor 7|floor 100|victory assured/i.test(first));
  }
  assert(customerBark({heroId:"adventurer-1",role:"DPS",
    kind:"credit-request",itemId:"iron-sword",gold:0}).length>0);
  assert.equal(customerBarkPriority("paid")>customerBarkPriority("restock"),true);
});

test("a role or known stock item changes the possible customer wording",()=>{
  const a=customerBark({heroId:"same",kind:"pickup",role:"tank",itemId:"bread"});
  const b=customerBark({heroId:"same",kind:"pickup",role:"healer",itemId:"bread"});
  // The role-specific variant is chosen deterministically by hero identity.
  assert.equal(typeof a,"string");
  assert.equal(typeof b,"string");
  const restock=customerBark({heroId:"same",kind:"restock",role:"DPS",
    itemId:"bread"});
  assert.match(restock,/Waybread/);
  assert.equal(customerBark({heroId:"same",kind:"restock",role:"DPS",
    itemId:"bread"}),restock);
});
