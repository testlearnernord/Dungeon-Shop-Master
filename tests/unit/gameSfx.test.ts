import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaCueSfx } from "../../src/gameSfx.ts";
import type { ArenaCue } from "../../src/game/arenaCombatMotion.ts";

test("Level 6 sound mapping covers every authoritative combat cue", () => {
  const kinds: ArenaCue["kind"][] = [
    "windup", "dodge", "parry", "miss", "hit", "hero-hit", "grab", "throw", "projectile",
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
  assert.deepEqual(arenaCueSfx("grab"), ["troll-grunt", "hero-hurt"]);
  assert.deepEqual(arenaCueSfx("throw"), ["troll-swing"]);
  assert.deepEqual(arenaCueSfx("miss",true,true),["troll-swing"],
    "failed grips must not produce fake ground collisions");
  assert.deepEqual(arenaCueSfx("lava"), ["lava-burn"]);
  assert.deepEqual(arenaCueSfx("victory"), ["troll-death"]);
  assert.deepEqual(arenaCueSfx("defeat"), ["hero-death"]);
  assert.ok(!arenaCueSfx("miss").includes("hero-hurt"));
  assert.deepEqual(arenaCueSfx("miss", false), ["hero-attack"]);
  assert.ok(!arenaCueSfx("dodge").includes("hero-hurt"));
});


import {
  SFX_CATALOG,SFX_OWNERS,SFX_FAMILIES,blankSfxDebugFilters,passesSfxDebugFilter,
} from "../../src/sfxCatalog.ts";

test("every registered effect has one explicit owner and audible category",()=>{
  assert.equal(SFX_CATALOG.length,30);
  assert.equal(new Set(SFX_CATALOG.map(entry=>entry.id)).size,30);
  for(const entry of SFX_CATALOG){
    assert.ok(SFX_OWNERS.some(o=>o.id===entry.owner),entry.id+" owner");
    assert.ok(SFX_FAMILIES.some(f=>f.id===entry.family),entry.id+" family");
    assert.ok(entry.label.includes(" · "),entry.id+" readable audition label");
  }
  assert.equal(SFX_CATALOG.find(entry=>entry.id==="projectile")?.family,"ranged");
  assert.equal(SFX_CATALOG.find(entry=>entry.id==="troll-impact")?.family,"melee");
  assert.equal(SFX_CATALOG.find(entry=>entry.id==="lava-burn")?.owner,"world");
});

test("source solo and type mute/solo intersect without mutating game state",()=>{
  const all=blankSfxDebugFilters();
  assert.ok(SFX_CATALOG.every(entry=>
    passesSfxDebugFilter(entry.owner,entry.family,all)));
  const soloTroll={...all,soloOwner:"troll" as const};
  assert.equal(passesSfxDebugFilter("hero","melee",soloTroll),false);
  assert.equal(passesSfxDebugFilter("troll","melee",soloTroll),true);
  const meleeOnly={...soloTroll,soloFamily:"melee" as const};
  assert.equal(passesSfxDebugFilter("troll","voice",meleeOnly),false);
  assert.equal(passesSfxDebugFilter("troll","melee",meleeOnly),true);
  const noMelee={...meleeOnly,mutedFamilies:new Set(["melee"] as const)};
  assert.equal(passesSfxDebugFilter("troll","melee",noMelee),false);
  const noWorld={...all,mutedOwners:new Set(["world"] as const)};
  assert.equal(passesSfxDebugFilter("world","environment",noWorld),false);
  assert.equal(passesSfxDebugFilter("hero","ranged",noWorld),true);
});
