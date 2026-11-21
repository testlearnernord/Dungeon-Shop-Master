import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {chooseLevel7Step} from "../../src/game/level7Exploration.ts";
import {predictDungeonHeroSteps,dungeonPreviewExplanation}
  from "../../src/game/dungeonIntentPreview.ts";

test("two-step map intentions are connected forecasts, never authoritative steps",()=>{
  const layout=generateExpeditionLayout(7349,1);
  const entry=layout.entrance;
  const hero={id:"hero-1",...entry,
    visited:[entry.z*layout.width+entry.x],
    activity:"exploring" as const,inCombat:false,
    plannedAction:"stay" as const};
  const saved=JSON.stringify(hero);
  const preview=predictDungeonHeroSteps(layout,hero);
  assert.ok(preview.length>=1&&preview.length<=2);
  const first=chooseLevel7Step(layout,{
    heroId:hero.id,...entry,visited:hero.visited});
  assert.deepEqual(preview[0],first);
  let last=entry;
  for(const next of preview){
    assert.ok(dungeonNeighbors(layout,last).some(p=>
      p.x===next.x&&p.z===next.z));
    last=next;
  }
  assert.equal(JSON.stringify(hero),saved,
    "Viewer predictions must not mutate saved movement/knowledge.");
});

test("combat and portal actors advertise no invented movement",()=>{
  const layout=generateExpeditionLayout(7350,2);
  const hero={id:"one",x:layout.entrance.x,z:layout.entrance.z,
    visited:[],activity:"combat" as const,inCombat:true,
    plannedAction:"stay" as const};
  assert.deepEqual(predictDungeonHeroSteps(layout,hero),[]);
  assert.deepEqual(predictDungeonHeroSteps(layout,{...hero,
    activity:"portal",inCombat:false}),[]);
});

test("every absent or partial preview gives a truthful reason, never fake motion",()=>{
  const layout=generateExpeditionLayout(7350,2);
  const p=layout.entrance;
  const hero={id:"hero",x:p.x,z:p.z,visited:[p.z*layout.width+p.x],
    activity:"exploring" as const,inCombat:false,
    plannedAction:"stay" as const};
  const msg=dungeonPreviewExplanation(layout,hero);
  assert.ok(msg.includes("PREVIEW")||msg.includes("Second step")||
    msg.includes("Site interaction"));
  assert.match(dungeonPreviewExplanation(layout,{...hero,
    activity:"combat",inCombat:true}),/LIVE combat.*paused/);
  assert.match(dungeonPreviewExplanation(layout,{...hero,
    activity:"portal"}),/portal.*no floor route/i);
  assert.match(dungeonPreviewExplanation(layout,{...hero,
    plannedAction:"ascend"}),/At staircase/);
});
