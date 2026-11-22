import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {ITEMS} from "../../src/game/economy.ts";

test("all currently tradable and recovered goods have a real shared item glyph",()=>{
  const svg=readFileSync(new URL("../../public/assets/ui-item-icons.svg",
    import.meta.url),"utf8");
  const symbolIds=[...svg.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]);
  for(const item of ITEMS){
    assert.ok(symbolIds.includes(item.id),
      item.id+" would render as a blank Hero Card / shop item pictogram");
  }
  assert.equal(new Set(symbolIds).size,symbolIds.length,
    "Item atlas may not contain duplicate symbol IDs");
  assert.ok(symbolIds.includes("coal"),"Coal is not generic iron ore");
});
