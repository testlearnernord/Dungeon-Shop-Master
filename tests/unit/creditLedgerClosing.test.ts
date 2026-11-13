import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { issueShopCredit } from "../../src/game/shopCredit.ts";
import { summarizeLedger } from "../../src/merchantLedger.ts";

test("day-close ledger displays shop loans separately from sales and keeps unpaid debt",()=>{
  const initial=createGameState(7351);
  const borrower=initial.adventurers[0];
  const broke={
    ...initial,
    adventurers:initial.adventurers.map(hero=>hero.id===borrower.id?
      {...hero,gold:0,inventory:{...hero.inventory,bread:0}}:hero),
  };
  const issued=issueShopCredit(broke,borrower.id);
  assert.notEqual(issued.state,broke);
  const after=advanceDay(issued.state).state;
  const report=summarizeLedger(issued.state,after);
  assert.equal(report.newCreditGold,4);
  assert.equal(report.outstandingCreditGold,4);
  assert.equal(report.credits.length,1);
  assert.equal(report.credits[0].type,"shop-credit");
  assert(!report.receipts.some(receipt=>receipt.heroId===borrower.id));
  assert.equal(report.bookedRevenue,report.receipts.reduce((sum,receipt)=>sum+receipt.revenue,0));
  assert.equal(after.shopDebts[0].outstandingGold,4);
  const later=summarizeLedger(after,advanceDay(after).state);
  assert.equal(later.newCreditGold,0);
  assert.equal(later.outstandingCreditGold,4);
});