import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {test} from "node:test";

test("soundtrack music is served from stable Vite public paths",()=>{
  for(const name of ["the-lean-season.mp3","beneath-the-surface.mp3",
    "no-safe-passage.mp3","desperate-measures.mp3"]){
    assert.ok(existsSync(new URL("../../public/audio/"+name,import.meta.url)),name);
  }
  assert.equal(existsSync(new URL("../../No Safe Passage.mp3",import.meta.url)),false,
    "The canonical No Safe Passage track is already present in public/audio/");
});

test("reproducible generated Troll and Ghoul GLBs are gitignored",()=>{
  const ignore=readFileSync(new URL("../../.gitignore",import.meta.url),"utf8");
  for(const name of [
    "public/assets/models/ashen-tunnel-mauler-tripo-combat.glb",
    "public/assets/models/dungeon-ghoul-tripo.glb",
  ]){
    assert.ok(ignore.includes(name),name);
  }
});
