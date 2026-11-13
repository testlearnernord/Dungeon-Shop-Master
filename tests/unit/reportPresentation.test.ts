import test from "node:test";
import assert from "node:assert/strict";
import {reportCategory,reportCounts,reportIcon} from "../../src/reportPresentation.ts";
test("sales and debt stay separate from dungeon and miscellaneous events",()=>{
  assert.equal(reportCategory({type:"sale"}),"shop");
  assert.equal(reportCategory({type:"shop-credit"}),"shop");
  assert.equal(reportCategory({type:"level6-combat"}),"dungeon");
  assert.equal(reportCategory({type:"level7-exploration"}),"dungeon");
  assert.equal(reportCategory({type:"day-started"}),"other");
  assert.equal(reportIcon({type:"sale"}),"receipt");
  assert.equal(reportIcon({type:"healed"}),"heart");
  assert.deepEqual(reportCounts([
    {type:"sale"},{type:"shop-credit"},{type:"level6-combat"},{type:"day-started"}
  ]),{total:4,shop:2,dungeon:1,other:1});
});
