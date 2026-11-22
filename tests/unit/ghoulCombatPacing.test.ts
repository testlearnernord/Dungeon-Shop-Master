import assert from "node:assert/strict";
import test from "node:test";
import {sampleGroupReplayPresentation} from "../../src/game/groupReplayPresentation.ts";
import {ghoulRecordedPhaseAge} from "../../src/game/ghoulMotion.ts";
import type {GroupReplayFrame} from "../../src/game/groupCombat.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {prepareSpatialDungeonCombat} from "../../src/game/spatialDungeonExploration.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";

const pose=(t:number,x:number,hp:number,phase:"move"|"windup")=>({
  t,
  actors:[{id:"ghoul",x,z:0,hp,stamina:100,heading:0,phase},
    {id:"hero",x:5,z:0,hp:90,stamina:100,heading:0,phase:"move" as const}],
  projectiles:[],
}) satisfies GroupReplayFrame;

test("10Hz saved poses animate smoothly at display-refresh timestamps, without fabricating damage",()=>{
  const frames=[pose(0,0,50,"move"),pose(.1,2,40,"windup")];
  const sample=sampleGroupReplayPresentation(frames,1/60);
  const middle=sampleGroupReplayPresentation(frames,3/60);
  const ghoul=middle.actors[0];
  assert.equal(sample.t,1/60);
  assert.equal(middle.t,3/60);
  assert(Math.abs(middle.actors[0].x-1)<1e-8);
  assert(sample.actors[0].x>0&&sample.actors[0].x<middle.actors[0].x);
  assert.equal(ghoul.hp,50,"HP MUST remain on the last committed frame");
  assert.equal(ghoul.phase,"move","Future phase must not leak through interpolation");
  assert.equal(ghoulRecordedPhaseAge(frames,"ghoul",middle.t),middle.t);
  const after=sampleGroupReplayPresentation(frames,.1);
  assert.equal(after.actors[0].hp,40);
  assert.equal(after.actors[0].phase,"windup");
  assert.equal(after.t,.1);
  assert.deepEqual(frames,[pose(0,0,50,"move"),pose(.1,2,40,"windup")],
    "render-only sampling must not mutate saved authoritative history");
  assert.deepEqual(sampleGroupReplayPresentation(frames,.05),middle,
    "rewind/seek must be deterministic regardless of prior sampling");
  assert.equal(sampleGroupReplayPresentation(frames,999).t,.1,
    "LIVE playback must never extrapolate into uncommitted future");
});

test("multiple simultaneous projectiles from one hero never interpolate into each other",()=>{
  const start=pose(0,0,50,"move");
  const end=pose(.1,0,50,"move");
  const frames:GroupReplayFrame[]=[
    {...start,projectiles:[
      {ownerId:"hero",x:1,z:1},{ownerId:"hero",x:5,z:5},
    ]},
    {...end,projectiles:[
      {ownerId:"hero",x:2,z:2},{ownerId:"hero",x:6,z:6},
    ]},
  ];
  const frame=sampleGroupReplayPresentation(frames,.05);
  assert.deepEqual(frame.projectiles,[
    {ownerId:"hero",x:1.5,z:1.5},{ownerId:"hero",x:5.5,z:5.5},
  ]);
});

test("new seeded early-floor Ghoul has real longer 60Hz combat, not artificially slowed footage",()=>{
  const seed=7351;
  const layout=generateExpeditionLayout(seed,1);
  const site=layout.features.find(f=>f.kind==="monster");
  assert(site);
  const approach=dungeonNeighbors(layout,site)[0];
  assert(approach);
  const hero=createGameState(seed).adventurers[0];
  const visitor={...hero,status:"exploring" as const,floor:1 as const,
    health:hero.stats.maxHealth,
    equipment:{weapon:"Iron Sword" as const,armor:"Leather Vest" as const}};
  const prepared=prepareSpatialDungeonCombat([visitor],site,seed,layout,approach);
  const ghoul=prepared.options.actors.find(spec=>spec.team==="monsters");
  assert(ghoul);
  assert(ghoul.maxHp>=36,"old 15-20HP paper-thin encounters should be gone");
  const battle=resolveGroupCombat(prepared.options,25);
  const seconds=battle.replay.frames.at(-1)?.t??0;
  assert(seconds>=8,
    "Combat must contain multiple actual exchanges, not a 4-second recording: "+seconds);
  assert.equal(battle.replay.frames[0]?.t,0);
  assert.equal(battle.replay.frames.at(-1)?.t,seconds);
  assert.equal(battle.replay.outcome,battle.state.outcome);
  assert(battle.replay.cues.some(cue=>cue.kind==="hit"||cue.kind==="miss"),
    "Real strike/miss records, no synthetic replay padding");
});

test("party-sized Ghoul HP increases without inventing new monster teams or second engines",()=>{
  const seed=7351,layout=generateExpeditionLayout(seed,1);
  const site=layout.features.find(f=>f.kind==="monster");
  assert(site);
  const approach=dungeonNeighbors(layout,site)[0];
  assert(approach);
  const heroes=createGameState(seed).adventurers.slice(0,3).map(hero=>({
    ...hero,status:"exploring" as const,floor:1 as const,
    health:hero.stats.maxHealth,
  }));
  const solo=prepareSpatialDungeonCombat(heroes.slice(0,1),site,seed,layout,approach);
  const party=prepareSpatialDungeonCombat(heroes,site,seed,layout,approach);
  const one=solo.options.actors.find(a=>a.team==="monsters");
  const together=party.options.actors.find(a=>a.team==="monsters");
  assert(one&&together);
  assert(together.hp>one.hp);
  assert.equal(party.options.actors.length,4);
  assert.equal(party.options.actors.filter(a=>a.team==="monsters").length,1);
  assert.equal(together.specialAbility,undefined,
    "The Cave Troll's unique grab/throw must not leak to ordinary Ghouls");
});
