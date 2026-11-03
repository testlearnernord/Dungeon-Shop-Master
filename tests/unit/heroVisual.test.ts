import assert from "node:assert/strict";
import test from "node:test";
import { appearanceForHero } from "../../src/game/heroIdentity.ts";

test("hero appearance is stable, independent of scene and cosmetic RNG", () => {
  assert.deepEqual(appearanceForHero("adventurer-1", "tank"),
    appearanceForHero("adventurer-1", "tank"));
  assert.notDeepEqual(appearanceForHero("adventurer-1", "tank"),
    appearanceForHero("adventurer-2", "tank"));
  assert.notDeepEqual(appearanceForHero("adventurer-1", "tank"),
    appearanceForHero("adventurer-1", "healer"));
});
