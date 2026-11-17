import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {test} from "node:test";
import {
  SFX_SAMPLE_DIR,SFX_SAMPLE_FILES,SFX_SAMPLES,SFX_HEAVY_SAMPLES,
  hasRecordedSfx,selectSfxSample,
} from "../../src/gameSfxSamples.ts";
import {SFX_CATALOG} from "../../src/sfxCatalog.ts";

test("each of the 11 curated recordings exists in the served directory",()=>{
  assert.equal(SFX_SAMPLE_FILES.length,11);
  assert.equal(new Set(SFX_SAMPLE_FILES).size,11);
  for(const file of SFX_SAMPLE_FILES){
    assert.ok(file.endsWith(".mp3"));
    assert.ok(existsSync(new URL("../../public/"+SFX_SAMPLE_DIR+file,import.meta.url)),file);
  }
  const ids=new Set(SFX_CATALOG.map(x=>x.id));
  for(const cue of [...Object.keys(SFX_SAMPLES),...Object.keys(SFX_HEAVY_SAMPLES)]){
    assert.ok(ids.has(cue),cue);
  }
});

test("six troll cues are recorded; attack slam chooses the alternate takes",()=>{
  for(const cue of ["troll-roar","troll-grunt","troll-step","troll-swing","troll-impact","boss-hurt"] as const)
    assert.equal(hasRecordedSfx(cue),true);
  assert.equal(hasRecordedSfx("troll-death"),false);
  assert.equal(hasRecordedSfx("hero-attack"),false);
  assert.equal(selectSfxSample("troll-grunt",0)?.file,"cave-troll-windup-grunt-a.mp3");
  assert.equal(selectSfxSample("troll-grunt",1)?.file,"cave-troll-windup-grunt-b.mp3");
  assert.equal(selectSfxSample("troll-grunt",2)?.file,"cave-troll-windup-grunt-a.mp3");
  assert.equal(selectSfxSample("boss-hurt",2)?.file,"cave-troll-hurt-c-heavy.mp3");
  assert.equal(selectSfxSample("troll-swing",0,true)?.file,"cave-troll-fist-whoosh-v1.mp3");
  assert.equal(selectSfxSample("troll-swing",0)?.file,"cave-troll-fist-whoosh-tight-v1.mp3");
  assert.equal(selectSfxSample("troll-impact",0,true)?.file,"cave-troll-fist-impact-heavy-v1.mp3");
  assert.equal(selectSfxSample("troll-impact",0)?.file,"cave-troll-fist-impact-short-v1.mp3");
});
