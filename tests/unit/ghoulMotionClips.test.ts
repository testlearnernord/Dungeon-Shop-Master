import assert from "node:assert/strict";
import test from "node:test";
import {ghoulRecordedStrikeOrdinal,ghoulMotionForPhase,
  ghoulRecordedPhaseAge,GHOUL_CLIP_INDICES}
  from "../../src/game/ghoulMotion.ts";
import type {GroupReplayFrame} from "../../src/game/groupCombat.ts";

const saved=(t:number,phase:GroupReplayFrame["actors"][number]["phase"]):
  GroupReplayFrame=>({
    t,actors:[{id:"ghoul",x:0,z:0,hp:10,stamina:10,
      heading:0,phase}],projectiles:[],
  });

test("Recorded successive claw strikes alternate authored right and left clips",()=>{
  const frames=[
    saved(0,"move"),saved(.2,"windup"),saved(.4,"strike"),
    saved(.5,"strike"),saved(.7,"recover"),saved(1,"windup"),
    saved(1.2,"strike"),saved(1.3,"strike"),saved(1.6,"recover"),
    saved(2,"strike"),
  ];
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",.48),1);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",1.25),2);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",2),3);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",0),0);
  assert.equal(ghoulMotionForPhase("strike",1).clip,"attack_claw_right");
  assert.equal(ghoulMotionForPhase("strike",2).clip,"attack_claw_left");
  assert.equal(ghoulMotionForPhase("strike",3).clip,"attack_claw_right");
  assert.equal(GHOUL_CLIP_INDICES.attack_claw_left,8);
  assert.equal(GHOUL_CLIP_INDICES.attack_claw_right,7);
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",1.3)-.1)<1e-6);
  assert.deepEqual(frames[2],saved(.4,"strike"));
});

test("Clip selection never depends on replay rendering order or RNG",()=>{
  const frames=[saved(0,"strike"),saved(.1,"recover"),
    saved(1,"strike"),saved(2,"dead")];
  const ordinal=ghoulRecordedStrikeOrdinal(frames,"ghoul",1.05);
  assert.equal(ordinal,2);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",0),1);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"unknown",1),0);
  assert.equal(ghoulMotionForPhase("dead").clip,"death_fall");
  assert.equal(ghoulMotionForPhase("move").clip,"walk_feral");
});

test("ongoing Ghoul playback indexes newly appended strikes without rescanning stale history",()=>{
  const frames=[
    saved(0,"move"),saved(.1,"windup"),saved(.2,"strike"),
    saved(.3,"recover"),
  ];
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",.2),1);
  frames.push(saved(.4,"windup"),saved(.5,"strike"),
    saved(.6,"strike"),saved(.7,"recover"));
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",.55),2);
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",.2),1,
    "Scrubbing backwards must not change saved attack identities");
  frames.push(saved(.8,"windup"),saved(.9,"strike"));
  assert.equal(ghoulRecordedStrikeOrdinal(frames,"ghoul",1),3);
  assert.equal(ghoulMotionForPhase("strike",
    ghoulRecordedStrikeOrdinal(frames,"ghoul",.55)).clip,
    "attack_claw_left");
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",.95)-.05)<1e-6);
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",.55)-.05)<1e-6);
});

test("long battle seeks phase age from the correct checkpoint even if the file has future frames",()=>{
  const frames=Array.from({length:901},(_,i)=>
    saved(i/10,i<300?"move":i<305?"windup":i<308?"strike":"recover"));
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",30.55)-.05)<1e-7);
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",10.25)-10.25)<1e-7);
  assert(Math.abs(ghoulRecordedPhaseAge(frames,"ghoul",90)-59.2)<1e-7);
});
