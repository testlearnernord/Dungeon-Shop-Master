import assert from "node:assert/strict";
import test from "node:test";
import {sampleCinematicTrack,type CinematicKeyframe}
  from "../../src/game/combatCinematic.ts";
import {createGroupCombatIntro,sampleGroupCombatIntro,GROUP_COMBAT_INTRO_SECONDS,BOSS_INTRO_SECONDS}
  from "../../src/game/groupCombatIntro.ts";
import type {CombatantSpec,GroupReplayFrame}
  from "../../src/game/groupCombat.ts";

const actor=(id:string,team:"heroes"|"monsters",x:number,z:number,
  boss=false):CombatantSpec=>({
  id,team,role:team==="heroes"?"tank":"monster",style:"melee",x,z,
  hp:60,maxHp:60,damage:6,armor:1,speed:2,reach:2,
  ...(boss?{specialAbility:"grapple-throw" as const}:{}),
});
const frame=(actors:readonly CombatantSpec[]):GroupReplayFrame=>({
  t:2.3,actors:actors.map(a=>({id:a.id,x:a.x+1,z:a.z+2,
    hp:31,stamina:6,heading:0,phase:"recover" as const})),
  projectiles:[],
});

test("Shared film interpolation clamps, remains deterministic and does not touch time",()=>{
  const frames:readonly CinematicKeyframe[]=[
    {at:0,eye:[0,2,0],look:[0,1,1],caption:"START"},
    {at:4,eye:[4,2,0],look:[2,1,1],caption:"END"},
  ];
  const snapshot=structuredClone(frames);
  assert.deepEqual(sampleCinematicTrack(frames,4,-4),
    sampleCinematicTrack(frames,4,0));
  assert.equal(sampleCinematicTrack(frames,4,2).eye[0],2);
  assert.equal(sampleCinematicTrack(frames,4,4).progress,1);
  assert.equal(sampleCinematicTrack(frames,4,999).time,4);
  assert.equal(sampleCinematicTrack(frames,4,NaN).time,0);
  assert.deepEqual(frames,snapshot);
  assert.throws(()=>sampleCinematicTrack(frames,3,0),RangeError);
});

test("Cinematic shows every real team count without producing extra actors",()=>{
  const cast=[actor("h1","heroes",-2,-4),actor("h2","heroes",-4,-4),
    actor("m1","monsters",2,3),actor("m2","monsters",5,4)];
  const saved=frame(cast);
  const snapshot=structuredClone({cast,saved});
  const film=createGroupCombatIntro("combat-1",cast,saved);
  assert.deepEqual(film.heroIds,["h1","h2"]);
  assert.deepEqual(film.monsterIds,["m1","m2"]);
  // The saved frame has already advanced relative to initial cast specs;
  // introduction looks at the real current position, not the spawn point.
  assert.deepEqual(film.keyframes[1].look,[4.5,2,5.5]);
  assert.deepEqual(film.keyframes[2].look,[-2,1.8,-2]);
  assert.equal(film.kind,"normal");
  assert.equal(film.duration,5.2);
  assert.equal(film.duration,GROUP_COMBAT_INTRO_SECONDS);
  assert.equal(sampleGroupCombatIntro(film,0).time,0);
  assert.match(sampleGroupCombatIntro(film,2).caption,/GHOUL PACK/);
  assert.match(sampleGroupCombatIntro(film,3).caption,/2 HEROES/);
  const end=sampleGroupCombatIntro(film,100);
  assert.equal(end.progress,1);
  for(let i=0;i<=52;i++){
    const shot=sampleGroupCombatIntro(film,i/10);
    assert(shot.eye.every(Number.isFinite));
    assert(shot.look.every(Number.isFinite));
  }
  assert.deepEqual({cast,saved},snapshot,
    "Opt-in camera changes do not create or alter saved combat frames");
});

test("Genuine solo ghoul and boss casts retain their true identities",()=>{
  const ghoul=[actor("hero","heroes",0,0),actor("ghoul","monsters",3,3)];
  const intro=createGroupCombatIntro("ghoul-1",ghoul,frame(ghoul));
  assert.match(sampleGroupCombatIntro(intro,2).caption,/THE GHOUL/);
  assert.match(sampleGroupCombatIntro(intro,3).caption,/ONE HERO/);
  const troll=[ghoul[0],actor("troll","monsters",5,1,true)];
  const bossIntro=createGroupCombatIntro("boss-1",troll,frame(troll));
  assert.equal(bossIntro.kind,"boss");
  assert.equal(bossIntro.duration,BOSS_INTRO_SECONDS,
    "boss reveals should remain longer than normal contact intros");
  assert.match(sampleGroupCombatIntro(bossIntro,6.0).caption,/TUNNEL MAULER/);
  assert.deepEqual(sampleGroupCombatIntro(bossIntro,0).look,
    [6,4.5,3], "opening shot must face the actual committed Troll position");
  assert.equal(sampleGroupCombatIntro(bossIntro,0).eye[1],4.6);
  assert.equal(bossIntro.monsterIds.length,1);
  assert.throws(()=>createGroupCombatIntro("solo",[ghoul[0]],frame([ghoul[0]])),
    RangeError);
});

test("3v3 camera director frames entire recorded cast, not fixed arena origin",()=>{
  const cast=[
    actor("h1","heroes",-9,-1),actor("h2","heroes",-7,0),
    actor("h3","heroes",-8,2),
    actor("m1","monsters",7,-2),actor("m2","monsters",8,0),
    actor("m3","monsters",9,2),
  ];
  const committed=frame(cast);
  const original=structuredClone({cast,committed});
  const normal=createGroupCombatIntro("pack-3v3",cast,committed);
  assert.equal(normal.kind,"normal");
  assert.equal(normal.duration,GROUP_COMBAT_INTRO_SECONDS);
  assert.deepEqual(normal.heroIds,["h1","h2","h3"]);
  assert.deepEqual(normal.monsterIds,["m1","m2","m3"]);
  assert.match(sampleGroupCombatIntro(normal,2).caption,/GHOUL PACK/);
  assert.match(sampleGroupCombatIntro(normal,3).caption,/3 HEROES/);
  for(let i=0;i<=52;i++){
    const shot=sampleGroupCombatIntro(normal,i/10);
    assert(shot.eye.every(Number.isFinite));
    assert(shot.look.every(Number.isFinite));
    assert(shot.eye[1]>1);
  }
  assert.deepEqual({cast,committed},original);
});

test("party-vs-boss uses boss camera length and party identity even on an alternate stage",()=>{
  const cast=[actor("h1","heroes",-5,-3),actor("h2","heroes",-7,-2),
    actor("h3","heroes",-5,0),actor("boss","monsters",4,3,true)];
  const saved=frame(cast);
  const boss=createGroupCombatIntro("party-boss",cast,saved);
  assert.equal(boss.kind,"boss");
  assert.equal(boss.duration,BOSS_INTRO_SECONDS);
  assert.equal(boss.keyframes.length,6);
  assert.match(sampleGroupCombatIntro(boss,8.5).caption,/3 HEROES/);
  assert.deepEqual(boss.heroIds,["h1","h2","h3"]);
  assert.deepEqual(boss.monsterIds,["boss"]);
  assert.deepEqual(sampleGroupCombatIntro(boss,0).look,[5,4.5,5]);
  assert.notDeepEqual(boss.keyframes[0].eye,boss.keyframes.at(-1)?.eye,
    "a boss intro must actually move the camera through distinct views");
});

test("overlapping team centers still give finite camera moves",()=>{
  const cast=[actor("h","heroes",0,0),actor("m","monsters",0,0)];
  const track=createGroupCombatIntro("overlap",cast,frame(cast));
  for(const keyframe of track.keyframes){
    assert(keyframe.eye.every(Number.isFinite));
    assert(keyframe.look.every(Number.isFinite));
  }
});
