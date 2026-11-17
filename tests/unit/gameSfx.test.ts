import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaCueSfx } from "../../src/gameSfx.ts";
import type { ArenaCue } from "../../src/game/arenaCombatMotion.ts";

test("Level 6 sound mapping covers every authoritative combat cue", () => {
  const kinds: ArenaCue["kind"][] = [
    "windup", "dodge", "parry", "miss", "hit", "hero-hit", "projectile",
    "heal", "stagger", "lava", "victory", "defeat",
  ];
  for (const kind of kinds) {
    const mapped = arenaCueSfx(kind);
    assert.ok(mapped.length > 0, kind + " should have an audible cue");
    assert.equal(new Set(mapped).size, mapped.length, kind + " duplicates a sound");
  }
});

test("windup is never a damage sound; contact, lava and death stay distinct", () => {
  assert.deepEqual(arenaCueSfx("windup"), ["troll-grunt"]);
  assert.deepEqual(arenaCueSfx("hit"), ["troll-impact", "hero-hurt"]);
  assert.deepEqual(arenaCueSfx("hero-hit"), ["boss-hurt"]);
  assert.deepEqual(arenaCueSfx("lava"), ["lava-burn"]);
  assert.deepEqual(arenaCueSfx("victory"), ["troll-death"]);
  assert.deepEqual(arenaCueSfx("defeat"), ["hero-death"]);
  assert.ok(!arenaCueSfx("miss").includes("hero-hurt"));
  assert.deepEqual(arenaCueSfx("miss", false), ["hero-attack"]);
  assert.ok(!arenaCueSfx("dodge").includes("hero-hurt"));
});
