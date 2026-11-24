import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,dungeonNeighbors,dungeonDownStair,dungeonShortestPath,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {chooseSpatialDungeonStep,chooseRenewedSiteStep,chooseDungeonTravelStep} from "../../src/game/spatialDungeonExploration.ts";
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
  const first=chooseSpatialDungeonStep(layout,{
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


test("unknown stair does not erase an ordinary autonomous exploration step",()=>{
  const layout=generateExpeditionLayout(7349,1);
  const home=layout.entrance;
  const visited=[home.z*layout.width+home.x];
  const hero={id:"solo",...home,visited,activity:"exploring" as const,
    inCombat:false,plannedAction:"descend" as const};
  const direct=chooseSpatialDungeonStep(layout,{heroId:hero.id,...home,visited});
  assert.ok(direct,"The seeded floor needs a valid initial frontier");
  assert.deepEqual(predictDungeonHeroSteps(layout,hero)[0],direct,
    "Not knowing the staircase cannot make a moving hero appear frozen");
  assert.deepEqual(hero.visited,visited,"Rendering cannot reveal new tiles");
});

test("fully explored hero previews authoritative renewed-site fallback",()=>{
  const layout=generateExpeditionLayout(7351,1);
  const visited:number[]=[];
  for(let z=0;z<layout.height;z++)for(let x=0;x<layout.width;x++){
    if(tileAt(layout,x,z)!=="wall")visited.push(z*layout.width+x);
  }
  const start=layout.entrance;
  const progress={heroId:"scout",...start,visited};
  assert.equal(chooseSpatialDungeonStep(layout,progress),null,
    "Already fully explored cells have no fresh frontier");
  const renewed=chooseRenewedSiteStep(layout,start,new Set(visited),new Set());
  assert.ok(renewed,"Seeded floor has at least one physically reachable site");
  const hero={id:"scout",...start,visited,activity:"exploring" as const,
    inCombat:false,plannedAction:"stay" as const};
  const before=JSON.stringify(hero);
  const preview=predictDungeonHeroSteps(layout,hero);
  assert.deepEqual(preview[0],renewed,
    "Preview must not omit the navigator's real replenished-site movement");
  assert.equal(JSON.stringify(hero),before);
  const resolved=layout.features.map(f=>f.id);
  assert.deepEqual(predictDungeonHeroSteps(layout,hero,resolved),[],
    "With no frontier or renewed site, do not invent motion");
  assert.match(dungeonPreviewExplanation(layout,hero,resolved),
    /No connected next tile/);
});

test("deep-floor forecasts use the shared stair navigator and stop at the gate",()=>{
  for(let floor=5;floor<=9;floor++){
    const layout=generateExpeditionLayout(7351,floor),stair=dungeonDownStair(layout);
    const route=dungeonShortestPath(layout,layout.entrance,stair);
    const hero={id:"veteran",...route[0],visited:route.map(p=>p.z*layout.width+p.x),
      activity:"exploring" as const,inCombat:false,plannedAction:"descend" as const};
    const direct=chooseDungeonTravelStep(layout,[{heroId:hero.id,...hero}],new Set(),
      {routeToKnownTarget:stair});
    assert.deepEqual(predictDungeonHeroSteps(layout,hero)[0],direct);
    assert.deepEqual(predictDungeonHeroSteps(layout,{...hero,...stair}),[]);
    assert.match(dungeonPreviewExplanation(layout,{...hero,...stair}),/At staircase/);
  }
});
