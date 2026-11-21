import assert from "node:assert/strict";
import test from "node:test";
import {REEL_BAR_HALF_HEIGHT,REEL_BITE_MIN_SECONDS,REEL_BITE_MAX_SECONDS,
  createFishingReel,clickFishingReel,stepFishingReel,
  resumeFishingReel,nextFishBiteDelay,nextBreakoutDelay}
  from "../../src/game/fishingReel.ts";

const low=()=>0,high=()=>1;

test("new fish bite delay stays random but no longer than 10 seconds",()=>{
  assert.equal(REEL_BITE_MIN_SECONDS,1);
  assert.equal(REEL_BITE_MAX_SECONDS,10);
  assert.equal(nextFishBiteDelay(low),1);
  assert.ok(nextFishBiteDelay(high)>9.99);
  assert.ok(nextFishBiteDelay(high)<=10);
  assert.equal(nextFishBiteDelay(()=>.5),5.5);
  assert.equal(nextBreakoutDelay(low),2.5);
  assert.ok(nextBreakoutDelay(high)<5.001);
});

test("only ALTERNATING left/right clicks pump the green catching bar",()=>{
  const initial=createFishingReel(low);
  const left=clickFishingReel(initial,"left");
  assert.equal(left.accepted,true);
  assert.equal(left.state.alternatingClicks,1);
  assert.ok(left.state.barVelocity>initial.barVelocity);
  const repeated=clickFishingReel(left.state,"left");
  assert.equal(repeated.accepted,false);
  assert.strictEqual(repeated.state,left.state);
  const right=clickFishingReel(repeated.state,"right");
  assert.equal(right.accepted,true);
  assert.equal(right.state.alternatingClicks,2);
  assert.ok(right.state.barVelocity>left.state.barVelocity);
  assert.equal(clickFishingReel(right.state,"right").accepted,false);
});

test("the green zone follows gravity and the fish dances vertically",()=>{
  const initial=createFishingReel(low);
  const first=stepFishingReel(initial,.05,high);
  assert.ok(first.state.barY<initial.barY);
  assert.equal(first.event,"none");
  let state=initial;
  for(let i=0;i<15;i++)state=stepFishingReel(state,.05,high).state;
  assert.ok(state.fishY>initial.fishY,
    "The fish follows independently changing vertical targets");
  assert.ok(state.barY>=REEL_BAR_HALF_HEIGHT);
  assert.ok(state.barY<=1-REEL_BAR_HALF_HEIGHT);
  assert.ok(state.fishY>=.07&&state.fishY<=.93);
});

test("the catch meter fills only while the fish overlaps the green zone",()=>{
  const initial=createFishingReel(low);
  const aligned={...initial,fishY:.48,fishGoal:.48,barY:.48,
    barVelocity:0,targetChangesIn:10,breakoutIn:10};
  const hit=stepFishingReel(aligned,.05,low);
  assert.ok(hit.state.progress>aligned.progress);
  const missed={...initial,fishY:.90,fishGoal:.90,barY:.20,
    barVelocity:0,targetChangesIn:10,breakoutIn:10};
  const miss=stepFishingReel(missed,.05,low);
  assert.ok(miss.state.progress<missed.progress);
});

test("landing, losing and fish breakout are different explicit events",()=>{
  const initial=createFishingReel(low);
  const aligned={...initial,fishY:.5,fishGoal:.5,barY:.5,
    progress:.999,breakoutIn:10,targetChangesIn:10};
  assert.equal(stepFishingReel(aligned,.05,low).event,"landed");
  const lost={...initial,fishY:.92,fishGoal:.92,barY:.125,
    progress:.001,elapsed:7,breakoutIn:10,targetChangesIn:10};
  assert.equal(stepFishingReel(lost,.05,low).event,"escaped");
  const running={...initial,progress:.5,breakoutIn:.01,targetChangesIn:10};
  assert.equal(stepFishingReel(running,.05,low).event,"breakout");
});

test("a three-flick counter returns to the SAME reel, preserving progress",()=>{
  const initial={...createFishingReel(low),progress:.55,barY:.7,
    fishY:.15,elapsed:4,alternatingClicks:12};
  const saved=resumeFishingReel(initial,true,high);
  assert.equal(saved.progress,.67);
  assert.equal(saved.fishY,initial.fishY);
  assert.equal(saved.barY,initial.barY);
  assert.equal(saved.alternatingClicks,12);
  assert.equal(saved.lastButton,null);
  assert.ok(saved.breakoutIn>=2.5&&saved.breakoutIn<=5);
  const penalty=resumeFishingReel(initial,false,low);
  assert.ok(Math.abs(penalty.progress-.35)<1e-9);
  assert.equal(penalty.fishY,initial.fishY);
});
