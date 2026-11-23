import test from "node:test";
import assert from "node:assert/strict";
import {isObservedMonsterStep,MONSTER_OBSERVATION_STEP_SECONDS,
  monsterObservationStepProgress}
  from "../../src/game/monsterObservationMotion.ts";
import {MONSTER_STEP_TICKS}
  from "../../src/game/dungeonMonsterWorld.ts";
import {LIVE_PARTY_STEP_SECONDS}
  from "../../src/game/livePartyPresentation.ts";
import {GHOUL_CLIP_INDICES} from "../../src/game/ghoulMotion.ts";

const before={x:5,z:6,siteCycle:2,lastMoveTick:1000,
  day:1,floor:1,worldTick:1200};
const after={...before,x:6,lastMoveTick:1400,worldTick:1400};

test("both observers interpolate one actually committed tile at the lawful Ghoul speed",()=>{
  assert.equal(isObservedMonsterStep(before,after),true);
  assert.equal(MONSTER_STEP_TICKS,400,
    "monster AI still advances only half as often as heroes");
  assert.equal(MONSTER_OBSERVATION_STEP_SECONDS,1.2);
  assert(MONSTER_OBSERVATION_STEP_SECONDS>LIVE_PARTY_STEP_SECONDS,
    "Ghouls should look heavier than heroes, but still finish each step");
  assert(MONSTER_OBSERVATION_STEP_SECONDS<MONSTER_STEP_TICKS*.05,
    "the mesh must visibly stop rather than continuously crawl until the next AI tick");
});

test("never draw a fake crossing from an observation gap or another floor",()=>{
  const rejected=[
    {...after,worldTick:1801},
    {...after,day:2},
    {...after,floor:2},
    {...after,siteCycle:3},
    {...after,x:7},
    {...after,x:5,z:8},
    {...after,x:5,z:6},
    {...after,lastMoveTick:1000},
    {...after,lastMoveTick:1800},
    {...after,lastMoveTick:1199},
    {...after,worldTick:1200},
    {...after,worldTick:1100},
  ];
  for(const current of rejected){
    assert.equal(isObservedMonsterStep(before,current),false,
      "A nonconsecutive, imaginary or regenerated step must snap");
  }
});

test("long gaps cannot resume stale interpolation even if the old and new tiles neighbor",()=>{
  assert.equal(isObservedMonsterStep({...before,worldTick:0,lastMoveTick:0},
    {...after,worldTick:800,lastMoveTick:800}),false);
  assert.equal(isObservedMonsterStep({...before,day:1,worldTick:28000,
    lastMoveTick:28000},{...after,day:2,worldTick:29000,
      lastMoveTick:29000}),false);
});

test("Ghoul visual movement finishes promptly and stays idle until the next true step",()=>{
  const duration=MONSTER_OBSERVATION_STEP_SECONDS;
  const values=[-1,0,duration/4,duration/2,duration,
    duration+1,MONSTER_STEP_TICKS*.05];
  assert.deepEqual(values.map(monsterObservationStepProgress),
    [0,0,.25,.5,1,1,1]);
  assert.equal(monsterObservationStepProgress(Infinity),1);
  assert.equal(monsterObservationStepProgress(NaN),1);
  assert.equal(monsterObservationStepProgress(10),1,
    "A stationary Ghoul must not creep for the entire 20-second AI interval");
});

test("the overview uses the same authored walk source index as the combat rig",()=>{
  assert.equal(GHOUL_CLIP_INDICES.walk_feral,13,
    "Tripo's archived clip 13 retains a long prompt name; walk_feral is an alias");
  assert.equal(GHOUL_CLIP_INDICES.idle_combat,14);
});
