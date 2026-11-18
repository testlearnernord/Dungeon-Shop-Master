import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {
  GHOUL_CLIP_INDICES,ghoulMotionForPhase,
  ghoulClipProgress,ghoulRecordedPhaseAge,
} from "../../src/game/ghoulMotion.ts";
import {cryptRelicPositions,CRYPT_FLOOR,CRYPT_STONE,CRYPT_WALL} from "../../src/game/ghoulCryptPlan.ts";
import type {GroupReplayFrame} from "../../src/game/groupCombat.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {simulateSpatialDungeonDay,emptyLevel7World} from "../../src/game/level7Exploration.ts";

test("every authored dungeon monster site is now a Ghoul on all playable ordinary floors",()=>{
  for(const floor of [1,2,3,4,7]){
    const map=generateExpeditionLayout(7351,floor);
    const monsters=map.features.filter(f=>f.kind==="monster");
    assert(monsters.length>0);
    assert(monsters.every(f=>f.subtype==="ghoul"));
    assert.deepEqual(generateExpeditionLayout(7351,floor),map,
      "Ghoul generation must retain seeded deterministic floor geometry");
  }
});

test("Ghoul visual clips correspond to authored 14+Idle archive, not Troll throw",()=>{
  assert.deepEqual(GHOUL_CLIP_INDICES,{
    attack_leap:1,hit_stagger:3,attack_claw_right:7,
    attack_claw_left:8,death_fall:9,run_aggressive:11,
    attack_charge:12,walk_feral:13,idle_combat:14,
  });
  const expectations=[
    ["move","walk_feral"],["windup","attack_leap"],
    ["strike","attack_claw_right"],["hurt","hit_stagger"],
    ["dead","death_fall"],["roll","run_aggressive"],
    ["recover","idle_combat"],["parry","idle_combat"],
  ] as const;
  for(const [phase,clip] of expectations)
    assert.equal(ghoulMotionForPhase(phase).clip,clip);
  const move=ghoulMotionForPhase("move");
  assert.equal(ghoulClipProgress(0,move),0);
  assert(ghoulClipProgress(7,move)>=0&&ghoulClipProgress(7,move)<1);
  assert.equal(ghoulClipProgress(10,ghoulMotionForPhase("dead")),1);
  assert.equal(ghoulClipProgress(10,ghoulMotionForPhase("strike")),1);
  assert(!Object.values(GHOUL_CLIP_INDICES).some(x=>x>14));
});

test("recorded phase age is stable across rewind and does not skip the claw windup",()=>{
  const frames=[
    {t:0,actors:[{id:"monster-0",phase:"move"}]},
    {t:.4,actors:[{id:"monster-0",phase:"move"}]},
    {t:.5,actors:[{id:"monster-0",phase:"windup"}]},
    {t:.7,actors:[{id:"monster-0",phase:"windup"}]},
    {t:.8,actors:[{id:"monster-0",phase:"strike"}]},
    {t:1.1,actors:[{id:"monster-0",phase:"recover"}]},
  ] as unknown as readonly GroupReplayFrame[];
  assert.equal(ghoulRecordedPhaseAge(frames,"monster-0",.75),.25);
  assert.equal(ghoulRecordedPhaseAge(frames,"monster-0",.81),
    .81-.8);
  assert.equal(ghoulRecordedPhaseAge(frames,"monster-0",.75),.25,
    "Scrubbing backwards must restore the original captured phase time");
  assert.equal(ghoulRecordedPhaseAge(frames,"unknown",.82),0);
});

test("crypt room relics hug chamber edges and never change the physical maze",()=>{
  for(const floor of [1,7]){
    const map=generateExpeditionLayout(7351,floor);
    for(const room of map.rooms){
      const positions=cryptRelicPositions(room);
      assert.equal(positions.length,4);
      assert(positions.every(p=>Math.abs(p.x)>2&&Math.abs(p.z)>2));
      assert(positions.every(p=>Math.abs(p.x)<room.width*1.25&&
        Math.abs(p.z)<room.height*1.25));
    }
  }
  for(const color of [CRYPT_FLOOR,CRYPT_STONE,CRYPT_WALL])
    assert.match(color,/^#[0-9a-f]{6}$/);
});

test("a new real Ghoul encounter records an actual enemy fight with no Troll special",()=>{
  const seed=7351,map=generateExpeditionLayout(seed,1);
  const monster=map.features.find(f=>f.kind==="monster")!;
  const entrance=map.entrance;
  const hero=createGameState(seed).adventurers[0];
  const visitor={...hero,status:"exploring" as const,floor:1 as const,
    health:hero.stats.maxHealth,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
  };
  const day=simulateSpatialDungeonDay(visitor,emptyLevel7World(),seed,2);
  assert(day.replay.version===1);
  assert(map.features.some(f=>f.id===monster.id&&f.subtype==="ghoul"));
  assert(day.replay.encounters.every(e=>e.combat.actors.every(a=>
    a.specialAbility!=="grapple-throw")));
  assert(entrance.x===1&&entrance.z===1);
});
