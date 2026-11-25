import {heroProgression} from "../../src/game/heroProgression.ts";
import {emptyShopTraffic} from "../../src/game/shopTraffic.ts";
import {WORLD_TICKS_PER_DAY} from "../../src/game/worldClock.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import { generateExpeditionLayout, dungeonNeighbors, tileAt } from "../../src/game/dungeonLayout.ts";
import { chooseCoLocatedDungeonParty,chooseBossRendezvous,negotiatePartyFloorDecisions } from "../../src/game/dungeonParties.ts";
import {
  simulateSpatialDungeonPartyDay, type SpatialDungeonWorld,
} from "../../src/game/spatialDungeonExploration.ts";
import type { AdventurerState } from "../../src/game/adventurers.ts";

const SEED=7351;
function party(floor:1|7=7):AdventurerState[]{
  return createGameState(SEED).adventurers.slice(0,3).map((hero,index)=>({
    ...hero,floor,status:"exploring" as const,
    role:(["tank","healer","DPS"] as const)[index],
    traits:{...hero.traits,negative:"stubborn"},
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    inventory:{...hero.inventory,healing:2},
    health:hero.stats.maxHealth,
  }));
}
function atUnresolvedSite(
  heroes:readonly AdventurerState[],kind:"monster"|"trap"|"treasure",
  generation=0,
):{world:SpatialDungeonWorld;featureId:string}{
  const layout=generateExpeditionLayout(SEED,heroes[0].floor);
  const feature=layout.features.find(f=>f.kind===kind&&
    (kind!=="monster"||generation===0||
      tileAt(layout,f.x,f.z)==="room"))!;
  assert(feature,"fixture requires a matching physical site");
  const approach=dungeonNeighbors(layout,feature)[0];
  const index=feature.z*layout.width+feature.x;
  const visited=layout.tiles.map((t,i)=>t!=="wall"&&i!==index?i:-1)
    .filter(i=>i>=0);
  return {featureId:feature.id,world:{
    resolvedFeatureIds:layout.features.filter(f=>f.id!==feature.id).map(f=>f.id),
    heroes:heroes.map(hero=>({heroId:hero.id,...approach,visited})),
    ...(generation?{siteCycles:[{id:feature.id,cycle:generation,resolvedDay:null}]}:{}),
  }};
}

test("only willing physically co-located explorers autonomously join one party",()=>{
  const heroes=party(7),layout=generateExpeditionLayout(SEED,7);
  const {world}=atUnresolvedSite(heroes,"monster",1);
  assert.deepEqual(chooseCoLocatedDungeonParty(heroes[0],heroes,world,layout,
    new Set()).map(hero=>hero.id),heroes.map(hero=>hero.id));
  const noJoin={...heroes[2],
    traits:{...heroes[2].traits,negative:"reckless"},
    role:"DPS" as const,health:heroes[2].stats.maxHealth};
  assert.deepEqual(chooseCoLocatedDungeonParty(heroes[0],
    [heroes[0],heroes[1],noJoin],world,layout,new Set())
    .map(hero=>hero.id),heroes.slice(0,2).map(h=>h.id));
  const moved={...world,heroes:world.heroes.map((p,index)=>index===1?
    {...p,x:layout.entrance.x,z:layout.entrance.z}:p)};
  assert.deepEqual(chooseCoLocatedDungeonParty(heroes[0],heroes,moved,layout,
    new Set()).map(h=>h.id),[heroes[0].id,heroes[2].id]);
  assert.deepEqual(chooseCoLocatedDungeonParty(heroes[0],heroes,world,layout,
    new Set([heroes[1].id])).map(h=>h.id),[heroes[0].id,heroes[2].id]);
});

test("three real heroes fight one regenerated heavy elite with distinct HP/Herbs",()=>{
  const heroes=party(),{world,featureId}=atUnresolvedSite(heroes,"monster",1);
  const before=structuredClone(world);
  const result=simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id)));
  assert.deepEqual(result,simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id))));
  assert.deepEqual(world,before,"No prior campaign state is mutated");
  assert.equal(result.ticks.length,3);
  assert.equal(result.ticks.every(t=>t.world===result.world),true);
  const records=result.ticks.map(t=>t.replay);
  assert.equal(records.every(r=>r.encounters.length===1),true);
  const encounter=records[0].encounters[0];
  assert.equal(encounter.featureId,featureId);
  assert.equal(encounter.combat.actors.length,4);
  assert.equal(encounter.combat.actors.filter(a=>a.team==="monsters").length,1);
  assert.equal(encounter.combat.actors.find(a=>a.id===featureId)?.specialAbility,
    undefined,"The Troll's grab/throw remains a unique boss skill");
  assert.equal(encounter.combat.actors.find(a=>a.id===featureId)?.meleeAbility,
    "heavy");
  for(const hero of heroes){
    const recorded=encounter.combat.actors.find(actor=>actor.id===hero.id)!;
    assert.deepEqual(recorded.equipment,{
      weapon:hero.role==="tank"?"Iron Sword":null,armor:"Leather Vest",
    },"Recorded gear must be historical and role-legal, not today's roster");
  }
  assert.equal(encounter.combat.actors.find(a=>a.id===featureId)?.equipment,
    undefined,"Monsters must never get fabricated shop inventory");
  assert.equal(encounter.combat.frames[0].actors.length,4);
  assert(records.every(r=>r.encounters[0].combat===encounter.combat),
    "All three event viewpoints must reference one committed encounter");
  assert(records.every(r=>r.steps.map(s=>s.action).join(",")===
    records[0].steps.map(s=>s.action).join(",")) ||
    records.some(r=>r.outcome==="death"),"Companions traverse the same corridor");
  for(const tick of result.ticks){
    const original=heroes.find(h=>h.id===tick.adventurer.id)!;
    const actor=encounter.combat.frames.at(-1)!.actors.find(a=>a.id===original.id)!;
    assert.equal(tick.adventurer.health,Math.round(actor.hp));
    const used=original.inventory.healing-tick.adventurer.inventory.healing;
    assert(used>=0&&used<=Math.min(2,original.inventory.healing),
      "Magical healer casts cannot be charged as phantom Herb purchases.");
    const healingCues=encounter.combat.cues.filter(c=>c.kind==="heal"&&
      c.actorId===original.id).length;
    assert(healingCues>=used,
      "Every consumed Herb must create a genuine healing cue.");
    assert(tick.adventurer.health>=0&&
      tick.adventurer.health<=heroProgression(tick.adventurer).maxHealth);
  }
  if(encounter.combat.outcome==="heroes"){
    assert.equal(result.ticks.reduce((sum,t)=>sum+t.gainedGold,0),6,
      "One elite site pays its gold exactly once, not once per fighter");
    assert.equal(result.ticks.reduce((sum,t)=>sum+t.defeatedMonsters,0),1);
    assert(result.world.resolvedFeatureIds.includes(featureId));
    assert.equal(result.world.siteCycles?.find(s=>s.id===featureId)?.resolvedDay,12);
  }
});

test("one chest is settled once, with no duplicated loot or gold for a party",()=>{
  const heroes=party(1),{world,featureId}=atUnresolvedSite(heroes,"treasure");
  const result=simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id)));
  assert(result.world.resolvedFeatureIds.includes(featureId));
  assert.equal(result.ticks.reduce((sum,t)=>sum+t.gainedLoot,0),1);
  const gold=result.ticks.reduce((sum,t)=>sum+t.gainedGold,0);
  assert(gold>=7&&gold<=15,"Chest value is shared, not multiplied");
  assert(result.ticks.every(t=>t.replay.steps.some(s=>
    s.action==="treasure"&&s.featureId===featureId)));
});

test("one party day commits all member outcomes into v14 campaign replays",()=>{
  const heroes=party(7),{world}=atUnresolvedSite(heroes,"monster",1);
  const result=simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id)));
  const base=createGameState(SEED);
  const committedTick=11*WORLD_TICKS_PER_DAY+200;
  const updated={
    ...base,day:12,worldClock:{...base.worldClock,tick:committedTick},
    shopTraffic:emptyShopTraffic(12,committedTick),
    shopEconomy:{...base.shopEconomy,
      dailySales:{...base.shopEconomy.dailySales,day:12}},
    adventurers:base.adventurers.map(h=>
      result.ticks.find(t=>t.adventurer.id===h.id)?.adventurer??h),
    dungeonWorlds:[{floor:7 as const,world:result.world}],dungeonFloors:[{floor:6,cleared:true}],
    events:[...base.events,...result.ticks.map(t=>({
      id:`day-12:${t.adventurer.id}:dungeon-live:${committedTick}`,
      day:12,type:"dungeon-live" as const,worldTick:committedTick,
      adventurerId:t.adventurer.id,message:"Expedition footage saved.",
      dungeonReplay:t.replay,
    }))],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(updated))),updated);
  const oldV1=structuredClone(createSave(updated));
  for(const event of oldV1.payload.events){
    for(const entry of event.dungeonReplay?.encounters??[])
      for(const actor of entry.combat.actors)delete (actor as any).equipment;
  }
  assert.doesNotThrow(()=>parseSave(JSON.stringify(oldV1)),
    "Old v1 fight recordings without a gear snapshot must remain readable");
  const wrongGear=structuredClone(createSave(updated));
  const firstFight=wrongGear.payload.events.find(e=>e.dungeonReplay)!
    .dungeonReplay!.encounters[0].combat;
  (firstFight.actors.find(a=>a.team==="heroes")!.equipment as any).armor=
    "Invented Dragon Plate";
  assert.throws(()=>parseSave(JSON.stringify(wrongGear)),/equipment.armor/,
    "Forged purchased equipment must not enter historical recordings");
  const forged=structuredClone(createSave(updated));
  const record=forged.payload.events.find(e=>e.dungeonReplay)!.dungeonReplay!;
  (record.encounters[0].combat.frames[0].actors as any)[1]=
    {...record.encounters[0].combat.frames[0].actors[0]};
  assert.throws(()=>parseSave(JSON.stringify(forged)),/unique|duplicate|exactly once/i,
    "A forged duplicate actor must never pass strict v13 validation");
});

test("co-located heroes resolve one real shared monster, not two seeded duels",()=>{
  const heroes=party(1).slice(0,2);
  const {world,featureId}=atUnresolvedSite(heroes,"monster");
  const initial=structuredClone(world);
  const result=simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id)));
  assert.deepEqual(world,initial,"A recorded encounter cannot mutate the prior world");
  assert.deepEqual(result,simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id))));
  assert.equal(result.ticks.length,2);
  const fights=result.ticks.map(t=>t.replay.encounters.find(e=>
    e.featureId===featureId)?.combat);
  assert(fights.every(Boolean));
  assert.strictEqual(fights[0],fights[1],
    "Both participants observe the SAME fixed-step combat recording");
  assert.equal(fights[0]!.actors.filter(actor=>actor.team==="heroes").length,2);
  assert.equal(fights[0]!.actors.filter(actor=>actor.team==="monsters").length,1);
  assert.equal(new Set(result.world.resolvedFeatureIds).size,
    result.world.resolvedFeatureIds.length,"A resolved site cannot be paid twice");
});

test("a real triggered trap can kill one party member while companions survive",()=>{
  const regular=party(1),heroes=[
    {...regular[0],health:1},regular[1],regular[2],
  ];
  const {world,featureId}=atUnresolvedSite(heroes,"trap");
  const result=simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id)));
  assert(result.ticks[0].replay.steps.some(step=>
    step.featureId===featureId&&step.action==="trap"));
  assert.equal(result.ticks[0].adventurer.health,0);
  assert.equal(result.ticks[0].adventurer.status,"dead");
  for(const tick of result.ticks.slice(1)){
    assert(tick.adventurer.health>0);
    assert.equal(tick.replay.outcome,"retreat");
    assert.equal(tick.adventurer.status,"exploring");
  }
  assert.equal(result.ticks.every(tick=>
    tick.replay.encounters.length===0),true,"Traps aren't fake fights");
  assert(result.world.resolvedFeatureIds.includes(featureId));
  assert.deepEqual(result,simulateSpatialDungeonPartyDay(heroes,world,SEED,12,
    new Set(heroes.map(h=>h.id))));
});

test("boss rendezvous uses visible eligible peers only and never recruits an unprepared companion",()=>{
  const base=createGameState(SEED).adventurers;
  const layout=generateExpeditionLayout(SEED,9);
  const at=layout.entrance;
  const neighbor=dungeonNeighbors(layout,at)[0];
  const ready=base.slice(0,2).map(h=>({...h,floor:9 as const,status:"exploring" as const,
    level:7,xp:600,health:heroProgression({...h,level:7}).maxHealth,
    inventory:{...h.inventory,bread:1},
    equipment:{weapon:h.role==="tank"?"Iron Sword":h.role==="DPS"?"Spear":"Staff",armor:"Leather Vest"}}))
    .sort((a,b)=>a.id.localeCompare(b.id));
  const index=(p:{x:number;z:number})=>p.z*layout.width+p.x;
  const world:SpatialDungeonWorld={resolvedFeatureIds:[],heroes:[
    {heroId:ready[0].id,...at,visited:[index(at)]},
    {heroId:ready[1].id,...neighbor,visited:[index(neighbor)]},
  ]};
  assert.deepEqual(chooseBossRendezvous(ready[0],ready,world,layout,new Set()),
    {peerId:ready[1].id,step:null});
  assert.deepEqual(chooseBossRendezvous(ready[1],ready,world,layout,new Set()),
    {peerId:ready[0].id,step:at});
  assert.equal(chooseBossRendezvous(ready[0],[ready[0],{...ready[1],equipment:{weapon:null,armor:null}}],
    world,layout,new Set()),null);
  assert.equal(chooseBossRendezvous(ready[0],ready,world,layout,new Set([ready[1].id])),null);
  const decisions=new Map([[ready[0].id,{goal:"progress" as const,action:"descend" as const}],
    [ready[1].id,{goal:"progress" as const,action:"stay" as const}]]);
  assert.notEqual(negotiatePartyFloorDecisions([ready[0],{...ready[1],equipment:{weapon:null,armor:null}}],
    decisions).get(ready[1].id)?.action,"descend");
});

test("healthy novice cannot be dragged deeper by a prepared companion",()=>{
  const base=createGameState(SEED).adventurers;
  const leader={...base[0],floor:3 as const,status:"exploring" as const,
    traits:{...base[0].traits,positive:"brave",negative:"stubborn"},
    equipment:{weapon:base[0].role==="tank"?"Iron Sword":base[0].role==="DPS"?"Spear":"Staff",armor:"Leather Vest"}};
  const novice={...base[1],floor:3 as const,status:"exploring" as const,
    equipment:{weapon:null,armor:"Leather Vest"}};
  const decisions=new Map<string,{goal:"progress"|"farm";action:"stay"|"descend"}>([
    [leader.id,{goal:"progress",action:"descend"}],[novice.id,{goal:"farm",action:"stay"}]]);
  const agreed=negotiatePartyFloorDecisions([leader,novice],decisions);
  assert.equal(agreed.get(leader.id)?.action,"descend");
  assert.equal(agreed.get(novice.id)?.action,"stay");
});

test("co-located formation fills distinct roles rather than choosing two copies of the same class",()=>{
  const layout=generateExpeditionLayout(SEED,7);
  const [tank,healer,dps]=party();
  const duplicate={...healer,id:"adventurer-0"};
  const group=chooseCoLocatedDungeonParty(tank,[duplicate,healer,dps,tank],
    {resolvedFeatureIds:[],heroes:[]},layout,new Set());
  assert.equal(group.length,3);
  assert.deepEqual(new Set(group.map(h=>h.role)),new Set(["tank","healer","DPS"]));
  assert(group.some(h=>h.id===dps.id));
});
