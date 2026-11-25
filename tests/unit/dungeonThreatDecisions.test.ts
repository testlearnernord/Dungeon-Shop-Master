import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld,advanceSpatialDungeonPartyStep}
  from "../../src/game/spatialDungeonExploration.ts";
import {advanceDungeonMonsterWorld} from "../../src/game/dungeonMonsterWorld.ts";
import {chooseDungeonThreatReaction,canSoloChallengeVisiblePack,chooseRememberedThreatReaction,recentDungeonThreat,THREAT_MEMORY_TICKS}
  from "../../src/game/dungeonThreatDecisions.ts";
import {observedGhoulPackSize} from "../../src/game/ghoulPack.ts";
import {selectKnownResourceSite} from "../../src/game/dungeonDecisions.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

const seed=7351,layout=generateExpeditionLayout(seed,1);
const original=createGameState(seed).adventurers;
const base=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
const canEvade=(pack:{x:number;z:number})=>
  dungeonNeighbors(layout,pack).some(point=>
    dungeonNeighbors(layout,point).some(next=>
      next.x!==pack.x||next.z!==pack.z));
const selected=base.monsters!.find(canEvade)!;
assert(selected);
const position=dungeonNeighbors(layout,selected).find(point=>
  dungeonNeighbors(layout,point).some(next=>
    next.x!==selected.x||next.z!==selected.z))!;
const monster={...selected,mode:"CHASING" as const,
  targetHeroId:original[0].id,lastKnown:position,lastSeenTick:200,
  lostSightChecks:0,target:position};
const world={...base,
  monsters:base.monsters!.map(m=>m.id===selected.id?monster:m),
  heroes:[{heroId:original[0].id,...position,visited:[
    layout.entrance.z*layout.width+layout.entrance.x,
    position.z*layout.width+position.x,
  ]}]};
const hero=(overrides:Partial<AdventurerState>={})=>({
  ...original[0],floor:1 as const,status:"exploring" as const,...overrides,
});

test("injured individual flees on a genuinely adjacent tile and the real walker commits it",()=>{
  const wounded=hero({health:Math.floor(heroProgression(original[0]).maxHealth*.3),
    traits:{...original[0].traits,positive:"careful"}});
  const reaction=chooseDungeonThreatReaction(layout,world,[wounded],[wounded]);
  assert(reaction);
  assert.equal(reaction.action,"ESCAPING");
  assert(dungeonNeighbors(layout,position).some(cell=>
    cell.x===reaction.step.x&&cell.z===reaction.step.z));
  assert.notDeepEqual(reaction.step,{x:selected.x,z:selected.z});
  const stepped=advanceSpatialDungeonPartyStep([wounded],world,seed,1,
    new Set([wounded.id]),{deferCombat:true,tacticalStep:reaction.step});
  const progress=stepped.world.heroes.find(h=>h.heroId===wounded.id);
  assert(progress);
  assert.deepEqual([progress.x,progress.z],[reaction.step.x,reaction.step.z]);
  assert.equal(stepped.ticks[0].replay.steps[1].action,"walk");
});

test("armed, experienced healthy warrior may deliberately confront the visible pursuer",()=>{
  const strong=hero({role:"tank",level:5,equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:heroProgression({...original[0],role:"tank",level:5}).maxHealth});
  const reaction=chooseDungeonThreatReaction(layout,world,[strong],[strong]);
  assert(reaction);
  assert.equal(reaction.action,"PREPARING_TO_FIGHT");
  assert.deepEqual(reaction.step,{x:selected.x,z:selected.z});
});

test("an unequipped isolated hero may move toward another truly visible helper",()=>{
  const weak=hero({level:1,equipment:{weapon:null,armor:null},
    traits:{...original[0].traits,positive:"generous"},health:40});
  const support=dungeonNeighbors(layout,position).find(p=>
    p.x!==selected.x||p.z!==selected.z);
  assert(support);
  const friend={...original[1],floor:1 as const,status:"exploring" as const};
  const known={...world,heroes:[...world.heroes,{
    heroId:friend.id,...support,visited:[
      layout.entrance.z*layout.width+layout.entrance.x,
      support.z*layout.width+support.x,
    ],
  }]};
  const reaction=chooseDungeonThreatReaction(layout,known,[weak],[weak,friend]);
  assert(reaction);
  assert.equal(reaction.action,"SEEKING_SUPPORT");
  assert.deepEqual(reaction.step,support);
});

test("a cautious underequipped hero without support chooses an actual one-cell LOS evasion",()=>{
  const weak=hero({level:1,health:heroProgression(original[0]).maxHealth,
    traits:{...original[0].traits,positive:"generous"},
    equipment:{weapon:null,armor:null}});
  const reaction=chooseDungeonThreatReaction(layout,world,[weak],[weak]);
  assert(reaction);
  assert.equal(reaction.action,"BREAKING_LOS");
  assert(dungeonNeighbors(layout,position).some(cell=>
    cell.x===reaction.step.x&&cell.z===reaction.step.z));
});

test("a hunted shop-bound returner can make one real tactical dodge without cancelling backtracking",()=>{
  const wounded=hero({health:Math.floor(heroProgression(original[0]).maxHealth*.3),
    traits:{...original[0].traits,positive:"careful"}});
  const reaction=chooseDungeonThreatReaction(layout,world,[wounded],[wounded]);
  assert(reaction&&reaction.action==="ESCAPING");
  const result=advanceSpatialDungeonPartyStep([wounded],world,seed,1,
    new Set([wounded.id]),{
      deferCombat:true,returnToEntrance:true,tacticalStep:reaction.step,
    });
  const positionAfter=result.world.heroes.find(p=>p.heroId===wounded.id);
  assert(positionAfter);
  assert.deepEqual({x:positionAfter.x,z:positionAfter.z},reaction.step,
    "tactical escape must override this ONE known portal-backtrack step");
  assert(dungeonNeighbors(layout,position).some(p=>
    p.x===positionAfter.x&&p.z===positionAfter.z));
  assert.equal(result.ticks[0].replay.steps[1].action,"walk");
  // Without a visible hunter on the next tick, the normal return navigator
  // still owns the saved route and does not receive any invented teleport.
  const after=advanceSpatialDungeonPartyStep([result.ticks[0].adventurer],
    {...result.world,monsters:[]},seed,1,new Set([wounded.id]),{
      deferCombat:true,returnToEntrance:true,
    });
  const next=after.world.heroes.find(p=>p.heroId===wounded.id);
  assert(next);
  assert(dungeonNeighbors(layout,positionAfter).some(p=>
    p.x===next.x&&p.z===next.z)||after.ticks[0].replay.steps[1]?.action==="complete");
});

test("a healthy armed returner does not charge a pursuer instead of going home",()=>{
  const ready=hero({role:"tank",level:5,equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:heroProgression({...original[0],role:"tank",level:5}).maxHealth});
  const result=chooseDungeonThreatReaction(layout,world,[ready],[ready],true);
  assert(result&&result.action==="ESCAPING");
  assert.notDeepEqual(result.step,{x:monster.x,z:monster.z});
});


test("an untreated cautious explorer avoids a visible idle pack without seeing hidden monsters",()=>{
  const wounded=hero({health:Math.floor(heroProgression(original[0]).maxHealth*.3)});
  const idle={...monster,mode:"IDLE" as const,targetHeroId:undefined};
  const visible={...world,monsters:[idle]};
  assert.equal(chooseDungeonThreatReaction(layout,visible,[wounded],[wounded]),null);
  const reaction=chooseDungeonThreatReaction(layout,visible,[wounded],[wounded],false,true);
  assert(reaction&&reaction.action==="ESCAPING");
  assert.notDeepEqual(reaction.step,{x:idle.x,z:idle.z});
});

test("visible pack risk respects real gear, health, experience and reckless personality",()=>{
  const deep=generateExpeditionLayout(seed,8);
  const seeded=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),deep,1,0);
  const packs=seeded.monsters!;
  const two=packs.find(m=>observedGhoulPackSize(deep,{x:m.homeX,z:m.homeZ},m.siteCycle)===2);
  const three=packs.find(m=>observedGhoulPackSize(deep,{x:m.homeX,z:m.homeZ},m.siteCycle)===3);
  assert(two&&three,"Fixture must include both real authored pack sizes");
  const veteran=hero({floor:8,role:"DPS",level:8,
    equipment:{weapon:"Forged Spear",armor:"Ghoul Leather Vest"},
    traits:{positive:"generous",neutral:"quiet",negative:"stubborn"}});
  const ready={...veteran,health:heroProgression(veteran).maxHealth};
  assert(canSoloChallengeVisiblePack(ready,deep,two));
  assert(!canSoloChallengeVisiblePack(ready,deep,three));
  assert(!canSoloChallengeVisiblePack({...ready,health:Math.floor(ready.health*.5)},deep,two));
  assert(!canSoloChallengeVisiblePack({...ready,equipment:{weapon:"Spear",armor:"Leather Vest"}},deep,two));
  assert(!canSoloChallengeVisiblePack({...ready,level:2},deep,two));
  assert(canSoloChallengeVisiblePack({...ready,traits:{...ready.traits,negative:"reckless"}},deep,three));
  assert(!canSoloChallengeVisiblePack({...ready,traits:{...ready.traits,positive:"careful",negative:"reckless"}},deep,three));
});

test("a visible three-Ghoul site is not an intentional solo hunting target but remains available to parties",()=>{
  const deep=generateExpeditionLayout(seed,8);
  const seeded=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),deep,1,0);
  const pack=seeded.monsters!.find(m=>observedGhoulPackSize(deep,{x:m.homeX,z:m.homeZ},m.siteCycle)===3&&dungeonNeighbors(deep,m).length>0);
  assert(pack);
  const at=dungeonNeighbors(deep,pack)[0];
  const veteran=hero({floor:8,role:"DPS",level:8,
    traits:{positive:"generous",neutral:"quiet",negative:"stubborn"},
    equipment:{weapon:"Forged Spear",armor:"Ghoul Leather Vest"}});
  const ready={...veteran,health:heroProgression(veteran).maxHealth};
  const progress={heroId:ready.id,...at,visited:[at.z*deep.width+at.x]};
  const visible={...seeded,heroes:[progress],monsters:[{...pack,mode:"IDLE" as const}]};
  assert.equal(selectKnownResourceSite(deep,progress,visible,"monster",[ready]),null);
  assert.equal(selectKnownResourceSite(deep,progress,visible,"monster",[ready,{...ready,id:"support"}])?.id,pack.id);
});

test("remembered LOS threat blocks the return to an exposed corridor, even when the actual pack is hidden",()=>{
  // Two connected branches: the old progress route runs through danger;
  // the safe vertical branch offers a genuine unexplored frontier.
  const width=9,height=9;
  const cells=[{x:1,z:1},{x:2,z:1},{x:3,z:1},{x:4,z:1},{x:5,z:1},
    {x:1,z:2},{x:1,z:3},{x:1,z:4},{x:1,z:5}];
  const tiles=Array.from({length:width*height},(_,i)=>cells.some(p=>p.z*width+p.x===i)
    ?"corridor" as const:"wall" as const);
  const map={...layout,width,height,tiles,entrance:cells[8],rooms:[],features:[]};
  const weak=hero({equipment:{weapon:null,armor:null},health:heroProgression(original[0]).maxHealth});
  const memory={monsterId:selected.id,x:5,z:1,seenTick:50};
  const at={x:1,z:2};
  const progress={heroId:weak.id,...at,visited:cells.slice(0,6).map(p=>p.z*width+p.x)};
  const hidden={...emptySpatialDungeonWorld(),heroes:[progress],monsters:[]};
  const reaction=chooseRememberedThreatReaction(map,hidden,[weak],memory,cells[4]);
  assert.deepEqual(reaction?.step,{x:1,z:3},"Do not immediately return to the threatened branch");
  const elsewhere={...hidden,monsters:[{...monster,x:1,z:5}]};
  assert.deepEqual(chooseRememberedThreatReaction(map,elsewhere,[weak],memory,cells[4]),reaction,
    "A hidden pack's current location must not change remembered routing");
  assert.equal(recentDungeonThreat([memory],50+THREAT_MEMORY_TICKS),undefined);
  const safe={...progress,x:1,z:5,visited:cells.map(p=>p.z*width+p.x)};
  assert.equal(chooseRememberedThreatReaction(map,{...hidden,heroes:[safe]},[weak],memory,cells[4])?.action,
    "WAITING_FOR_SAFETY");
  const armed=hero({role:"tank",level:5,equipment:{weapon:"Iron Sword",armor:"Leather Vest"}});
  const leader={...armed,health:heroProgression(armed).maxHealth};
  const ally={...leader,id:"companion"};
  assert.equal(chooseRememberedThreatReaction(map,{...hidden,heroes:[{...progress,heroId:leader.id},
    {...progress,heroId:ally.id}]},[leader,ally],memory,cells[4]),null,
    "A capable new party may reassess a threat remembered from solo travel");
});
