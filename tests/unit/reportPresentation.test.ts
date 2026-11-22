import test from "node:test";
import assert from "node:assert/strict";
import {reportCategory,reportCounts,reportIcon} from "../../src/reportPresentation.ts";
test("sales and debt stay separate from dungeon and miscellaneous events",()=>{
  assert.equal(reportCategory({type:"sale"}),"shop");
  assert.equal(reportCategory({type:"shop-credit"}),"shop");
  assert.equal(reportCategory({type:"hero-buyback"}),"shop");
  assert.equal(reportCategory({type:"dungeon-live"}),"dungeon");
  assert.equal(reportCategory({type:"day-started"}),"other");
  assert.equal(reportIcon({type:"sale"}),"receipt");
  assert.equal(reportIcon({type:"hero-buyback"}),"receipt");
  assert.equal(reportIcon({type:"healed"}),"heart");
  assert.deepEqual(reportCounts([
    {type:"sale"},{type:"shop-credit"},{type:"dungeon-live"},{type:"day-started"}
  ]),{total:4,shop:2,dungeon:1,other:1});
});
