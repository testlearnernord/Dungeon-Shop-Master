import assert from "node:assert/strict";
import test from "node:test";
import {sampleCinematicTrack,type CinematicKeyframe}
  from "../../src/game/combatCinematic.ts";
import {BOSS_INTRO_SECONDS,sampleBossIntro}
  from "../../src/game/bossCinematic.ts";
import {createGroupCombatIntro,sampleGroupCombatIntro,GROUP_COMBAT_INTRO_SECONDS}
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

test("Boss camera preserves authored eye/look and the 13.5 second finale",()=>{
  assert.equal(BOSS_INTRO_SECONDS,13.5);
  assert.deepEqual(sampleBossIntro(0).eye,[-14.5,7.8,-16]);
  assert.deepEqual(sampleBossIntro(0).look,[0,3.8,0]);
  assert.deepEqual(sampleBossIntro(BOSS_INTRO_SECONDS).eye,[4,5,-17]);
  assert.deepEqual(sampleBossIntro(BOSS_INTRO_SECONDS).look,[0,3,-3]);
  assert.deepEqual(sampleBossIntro(3.2).eye,[-7.4,6.5,-9.4]);
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
  assert.deepEqual(film.keyframes[1].look,[3,2.6,5]);
  assert.deepEqual(film.keyframes[2].look,[-1,2.6,-2]);
  assert.equal(film.duration,GROUP_COMBAT_INTRO_SECONDS);
  assert.equal(sampleGroupCombatIntro(film,0).time,0);
  assert.match(sampleGroupCombatIntro(film,2).caption,/GHOUL PACK/);
  assert.match(sampleGroupCombatIntro(film,4).caption,/2 HEROES/);
  const end=sampleGroupCombatIntro(film,100);
  assert.equal(end.progress,1);
  for(let i=0;i<=85;i++){
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
  assert.match(sampleGroupCombatIntro(intro,4).caption,/ONE HERO/);
  const troll=[ghoul[0],actor("troll","monsters",5,1,true)];
  const bossIntro=createGroupCombatIntro("boss-1",troll,frame(troll));
  assert.equal(bossIntro.duration,BOSS_INTRO_SECONDS,
    "the shared viewer must not shorten the authored boss introduction");
  assert.match(sampleGroupCombatIntro(bossIntro,5.7).caption,/TUNNEL MAULER/);
  assert.deepEqual(sampleGroupCombatIntro(bossIntro,0).eye,
    [-8.5,7.8,-13], "camera shifts relative to the real saved boss spawn");
  assert.equal(bossIntro.monsterIds.length,1);
  assert.throws(()=>createGroupCombatIntro("solo",[ghoul[0]],frame([ghoul[0]])),
    RangeError);
});
