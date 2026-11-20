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
