import assert from "node:assert/strict";
import test from "node:test";
import { level6ReturnIds } from "../../src/game/npcVisitors.ts";

test("only yesterday's successful Level 6 survivors use that entrance", () => {
  const events = [
    { type: "level6-return", day: 2, adventurerId: "adventurer-1" },
    { type: "level6-combat", day: 3, adventurerId: "adventurer-2" },
    { type: "level6-return", day: 3, adventurerId: "adventurer-2" },
    { type: "shop-arrival", day: 4, adventurerId: "adventurer-2" },
  ];
  assert.deepEqual([...level6ReturnIds(events, 4)], ["adventurer-2"]);
  assert.deepEqual([...level6ReturnIds(events, 5)], []);
  assert.equal(level6ReturnIds(events, 4).has("adventurer-1"), false);
});
