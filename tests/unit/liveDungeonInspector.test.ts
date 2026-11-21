import assert from "node:assert/strict";
import test from "node:test";
import {floorHeroLocatorOptions,formatHeroDungeonFinds}
  from "../../src/game/liveDungeonInspector.ts";

test("LIVE locator lists only actual floor heroes in stable order and flags genuine fights",()=>{
  const heroes=[
    {id:"hero-3",name:"Zara",role:"DPS" as const,level:4,inCombat:false},
    {id:"hero-1",name:"Alden",role:"tank" as const,level:2,inCombat:true},
    {id:"hero-2",name:"Alden",role:"healer" as const,level:3,inCombat:false},
  ] as const;
  const original=JSON.stringify(heroes);
  assert.deepEqual(floorHeroLocatorOptions(heroes),[
    {id:"hero-1",label:"Alden · Lv 2 tank · IN COMBAT"},
    {id:"hero-2",label:"Alden · Lv 3 healer"},
    {id:"hero-3",label:"Zara · Lv 4 DPS"},
  ]);
  assert.equal(JSON.stringify(heroes),original,"Spectator never edits the roster");
  assert.deepEqual(floorHeroLocatorOptions([]),[]);
});

test("inspector shows saved individual physical finds, not phantom abstract loot",()=>{
  const finds={"iron-ore":1,coal:2,"healing-herb":3} as const;
  const original=JSON.stringify(finds);
  assert.equal(formatHeroDungeonFinds(finds),
    "Healing Herb ×3 · Iron Ore ×1 · Coal ×2");
  assert.equal(formatHeroDungeonFinds(undefined),"None carried");
  assert.equal(formatHeroDungeonFinds({coal:0}),"None carried");
  assert.equal(JSON.stringify(finds),original);
});
