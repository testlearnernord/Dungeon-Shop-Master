import assert from "node:assert/strict";
import test from "node:test";
import {BOSS_INTRO_SECONDS,sampleBossIntro} from "../../src/game/bossCinematic.ts";

test("cinematic camera lasts through the Desperate Measures 13–14s impact",()=>{
  assert.equal(BOSS_INTRO_SECONDS,13.5);
  const start=sampleBossIntro(0);
  const middle=sampleBossIntro(8.6);
  const end=sampleBossIntro(BOSS_INTRO_SECONDS);
  assert.equal(start.time,0);
  assert.match(start.caption,/ASHEN TUNNEL/);
  assert.equal(end.time,13.5);
  assert.equal(end.progress,1);
  assert.equal(sampleBossIntro(100).progress,1);
  assert.equal(sampleBossIntro(-5).time,0);
  assert.notDeepEqual(start.eye,middle.eye);
  assert.notDeepEqual(middle.look,end.look);
  for(let i=0;i<=135;i++){
    const view=sampleBossIntro(i/10);
    assert(view.eye.every(Number.isFinite));
    assert(view.look.every(Number.isFinite));
    assert(view.progress>=0&&view.progress<=1);
    assert(view.time<=BOSS_INTRO_SECONDS);
  }
});
