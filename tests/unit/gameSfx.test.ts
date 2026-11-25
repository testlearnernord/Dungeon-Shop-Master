import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SFX_CATALOG,SFX_OWNERS,SFX_FAMILIES,blankSfxDebugFilters,passesSfxDebugFilter,
} from "../../src/sfxCatalog.ts";

test("every registered effect has one explicit owner and audible category",()=>{
  assert.equal(SFX_CATALOG.length,35);
  assert.equal(new Set(SFX_CATALOG.map(entry=>entry.id)).size,SFX_CATALOG.length);
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
