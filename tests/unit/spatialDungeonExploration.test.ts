import {emptyShopTraffic} from "../../src/game/shopTraffic.ts";
import {WORLD_TICKS_PER_DAY} from "../../src/game/worldClock.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { generateDungeonLayout, generateExpeditionLayout,dungeonDownStair,dungeonShortestPath,dungeonNeighbors, tileAt } from "../../src/game/dungeonLayout.ts";
import {
  emptySpatialDungeonWorld, getSpatialDungeonProgress, simulateSpatialDungeonDay, advanceSpatialDungeonPartyStep,
  chooseSpatialDungeonStep,chooseDungeonTransitionRoute,chooseKnownRouteStep, SPATIAL_DUNGEON_STEP_BUDGET,
  type SpatialDungeonWorld,
} from "../../src/game/spatialDungeonExploration.ts";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import type { AdventurerState } from "../../src/game/adventurers.ts";

function dungeonHero(): AdventurerState {
  const original=createGameState().adventurers[0];
  return { ...original, health:original.stats.maxHealth,
    role:"tank", equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    status:"exploring",floor:7 };
}

test("level 7 autonomous navigation stays on connected grid edges, never crosses walls", () => {
  const map=generateDungeonLayout(7351,7);
  let route=getSpatialDungeonProgress(emptySpatialDungeonWorld(),"adventurer-1",map);
  for(let i=0;i<300;i++){
    const next=chooseSpatialDungeonStep(map,route);
    if(!next)break;
    assert(dungeonNeighbors(map,route).some(p=>p.x===next.x&&p.z===next.z),
      "AI must make only legal adjacent moves");
    const idx=next.z*map.width+next.x;
    route={...route,x:next.x,z:next.z,
      visited:route.visited.includes(idx)?route.visited:[...route.visited,idx]};
  }
  assert(route.visited.length>75);
  assert.equal(route.visited[0],map.entrance.z*map.width+map.entrance.x);
});

test("same hero and world produce identical bounded routes and authoritative combat outcomes", () => {
  const hero=dungeonHero(), start=emptySpatialDungeonWorld();
  const first=simulateSpatialDungeonDay(hero,start,7351,4);
  const again=simulateSpatialDungeonDay(hero,start,7351,4);
  assert.deepEqual(first,again);
  assert.deepEqual(start,emptySpatialDungeonWorld(),"Simulator must not mutate inputs");
  assert(first.replay.steps.length<=1+SPATIAL_DUNGEON_STEP_BUDGET*3+3);
  assert.equal(first.replay.heroId,hero.id);
  assert.equal(first.replay.appearance.equipment.weapon,"Iron Sword");
  assert.equal(first.adventurer.floor,7);
  assert.equal(first.adventurer.status,"exploring");
  assert(first.world.heroes[0].visited.length>1);
});

test("persistent shared monsters, traps, loot and fights never reroll on camera/replay", () => {
  const hero=dungeonHero();
  const map=generateDungeonLayout(7351,7);
  let world:SpatialDungeonWorld=emptySpatialDungeonWorld();
  let sawCombat=false, sawLoot=false, sawTrap=false;
  const allEncounterFeatures=new Set<string>();
  for(let day=2;day<70;day++){
    const result=simulateSpatialDungeonDay(hero,world,7351,day);
    world=result.world;
    for(const step of result.replay.steps){
      if(step.action==="treasure")sawLoot=true;
      if(step.action==="trap")sawTrap=true;
    }
    for(const encounter of result.replay.encounters){
      sawCombat=true;
      const actual=map.features.find(x=>x.id===encounter.featureId);
      assert(actual && actual.kind==="monster");
      assert.equal(encounter.x,actual.x);
      assert.equal(encounter.z,actual.z);
      assert(encounter.combat.frames.length>1);
      assert(encounter.combat.cues.some(x=>x.kind==="hit"||x.kind==="miss"));
      assert.equal(encounter.combat.outcome,
        result.adventurer.status==="dead"?"monsters":
          encounter.combat.outcome);
      allEncounterFeatures.add(encounter.featureId);
    }
    const progress=world.heroes.find(p=>p.heroId===hero.id);
    const expectedResolved=new Set(world.resolvedFeatureIds);
    assert.equal(expectedResolved.size,world.resolvedFeatureIds.length);
    if(progress){
      for(const step of result.replay.steps){
        assert(dungeonNeighbors(map,{x:step.x,z:step.z}).length>0);
      }
    }
    if(sawCombat&&sawLoot&&sawTrap)break;
    if(result.adventurer.status==="dead"||result.adventurer.status==="traveling"){
      // Resume with a fresh, living veteran at the entrance. World remains shared.
      world={...world,heroes:world.heroes.filter(p=>p.heroId!==hero.id)};
    }
  }
  assert(sawCombat,"At least one real recorded monster encounter is expected");
  // Combat balance can prevent this autonomous veteran from reaching
  // every resource type. Verify both resource settlements independently
  // on real authored adjacent tiles rather than depending on survival.
  for(const [kind,action] of [["treasure","treasure"],["trap","trap"]] as const){
    const feature=map.features.find(f=>f.kind===kind&&dungeonNeighbors(map,f).length>0);
    assert(feature,"The seeded floor must contain an actual "+kind);
    const at=dungeonNeighbors(map,feature)[0];
    const initial={...emptySpatialDungeonWorld(),heroes:[{
      heroId:hero.id,...at,visited:[at.z*map.width+at.x],
    }]};
    const once=advanceSpatialDungeonPartyStep([hero],initial,7351,2,
      new Set([hero.id]),{tacticalStep:feature});
    const recorded=once.ticks[0].replay.steps.find(s=>s.action===action);
    assert(recorded&&recorded.featureId===feature.id);
    assert.equal(recorded.x,feature.x);assert.equal(recorded.z,feature.z);
    assert(once.world.resolvedFeatureIds.includes(feature.id));
    const again=advanceSpatialDungeonPartyStep([hero],initial,7351,2,
      new Set([hero.id]),{tacticalStep:feature});
    assert.deepEqual(once,again,"Identical actual resource contact must settle deterministically");
  }
  assert(allEncounterFeatures.size>0);
});

test("ordinary Floor 6 never creates a direct Floor-7 shop departure",()=>{
  const initial=createGameState(7351);
  const authorized={...initial.adventurers[0]};
  const state={...initial,dungeonFloors:[{floor:6,cleared:true}],
    adventurers:[authorized,...initial.adventurers.slice(1)]};
  const first=advanceDay(state);
  const hero=first.state.adventurers.find(h=>h.id===authorized.id)!;
  assert.notEqual(hero.status,"expedition");
  assert(!first.events.some(e=>e.type==="level7-departure"||
    e.type==="level6-departure"||e.type==="level6-combat"));
  assert.deepEqual(parseSave(JSON.stringify(createSave(first.state))),first.state);
  assert.deepEqual(advanceDay(state),first);
});

test("dungeon healer pays a real supply for each actual fixed-step healing action", () => {
  const map=generateDungeonLayout(7351,7);
  const monster=map.features.find(f=>f.kind==="monster")!;
  const approach=dungeonNeighbors(map,monster)[0];
  const monsterIndex=monster.z*map.width+monster.x;
  const visited=map.tiles.map((kind,index)=>kind!=="wall"&&index!==monsterIndex?index:-1)
    .filter(index=>index>=0);
  const hero=dungeonHero();
  const healer:AdventurerState={
    ...hero,role:"healer",health:Math.floor(hero.stats.maxHealth/2),
    inventory:{...hero.inventory,healing:3},
  };
  const world:SpatialDungeonWorld={
    resolvedFeatureIds:map.features.filter(f=>f.id!==monster.id).map(f=>f.id),
    heroes:[{heroId:hero.id,x:approach.x,z:approach.z,visited}],
  };
  const result=simulateSpatialDungeonDay(healer,world,7351,12);
  assert.equal(result.replay.encounters.length,1);
  const healingCues=result.replay.encounters[0].combat.cues.filter(
    cue=>cue.actorId===hero.id&&cue.kind==="heal");
  assert(healingCues.length>0,"The injured healer should treat themselves");
  assert.equal(result.adventurer.inventory.healing,3-healingCues.length);
  assert(healingCues.length<=2,"No more than two charges per encounter");
});

test("a tank really spends purchased Herbs in a committed ordinary encounter",()=>{
  const map=generateDungeonLayout(7351,7);
  const monster=map.features.find(feature=>feature.kind==="monster")!;
  const approach=dungeonNeighbors(map,monster)[0];
  const monsterIndex=monster.z*map.width+monster.x;
  const visited=map.tiles.map((kind,index)=>kind!=="wall"&&index!==monsterIndex?index:-1)
    .filter(index=>index>=0);
  const base=dungeonHero();
  const tank:AdventurerState={
    ...base,role:"tank",health:Math.floor(base.stats.maxHealth/2),
    inventory:{...base.inventory,healing:2},
  };
  const world:SpatialDungeonWorld={
    resolvedFeatureIds:map.features.filter(feature=>feature.id!==monster.id)
      .map(feature=>feature.id),
    heroes:[{heroId:tank.id,x:approach.x,z:approach.z,visited}],
  };
  const first=simulateSpatialDungeonDay(tank,world,7351,12);
  const same=simulateSpatialDungeonDay(tank,world,7351,12);
  assert.deepEqual(first,same);
  assert.equal(first.replay.encounters.length,1);
  const cures=first.replay.encounters[0].combat.cues.filter(cue=>
    cue.kind==="heal"&&cue.actorId===tank.id&&cue.targetId===tank.id);
  assert(cures.length>0,"a tank should use a bought Healing Herb in combat");
  assert(cures.every(cue=>cue.amount>0 && cue.amount<=18));
  assert.equal(first.adventurer.inventory.healing,2-cures.length);
  assert.deepEqual(world.heroes[0].heroId,tank.id,
    "the spatial encounter cannot mutate original world history");
});

test("regenerated Floor 7 room sentry uses heavy strikes but not the unique Troll throw",()=>{
  const seed=7351,day=12,layout=generateDungeonLayout(seed,7);
  const eliteSite=layout.features.find(feature=>feature.kind==="monster"&&
    tileAt(layout,feature.x,feature.z)==="room");
  assert(eliteSite,"At least one room sentry must exist for this seeded dungeon");
  const approach=dungeonNeighbors(layout,eliteSite)[0];
  const index=eliteSite.z*layout.width+eliteSite.x;
  const visited=layout.tiles.map((kind,i)=>kind!=="wall"&&i!==index?i:-1)
    .filter(i=>i>=0);
  const hero=dungeonHero();
  const world:SpatialDungeonWorld={
    resolvedFeatureIds:layout.features.filter(f=>f.id!==eliteSite.id).map(f=>f.id),
    heroes:[{heroId:hero.id,x:approach.x,z:approach.z,visited}],
    siteCycles:[{id:eliteSite.id,cycle:1,resolvedDay:null}],
  };
  const first=simulateSpatialDungeonDay(hero,world,seed,day);
  assert.deepEqual(first,simulateSpatialDungeonDay(hero,world,seed,day));
  assert.equal(first.replay.encounters.length,1,"The room elite must be actually encountered");
  const fight=first.replay.encounters[0].combat;
  const enemy=fight.actors.find(actor=>actor.id===eliteSite.id)!;
  assert.equal(enemy.specialAbility,undefined,
    "The Cave Troll's signature throw is never given to renewable sentries");
  assert.equal(enemy.meleeAbility,"heavy");
  assert.equal(enemy.radius,1.05);
  assert.equal(enemy.staggerThreshold,12);
  assert(fight.frames.length>1);
  assert.equal(fight.actors.length,2);
  assert.deepEqual(world.heroes[0].visited,visited,"Exploration never mutates prior knowledge");
  const initial=createGameState(seed);
  const committedTick=(day-1)*WORLD_TICKS_PER_DAY+200;
  const saved={
    ...initial,day,worldClock:{...initial.worldClock,tick:committedTick},
    shopTraffic:emptyShopTraffic(day,committedTick),
    shopEconomy:{...initial.shopEconomy,
      dailySales:{...initial.shopEconomy.dailySales,day}},
    adventurers:initial.adventurers.map(a=>
      a.id===hero.id?first.adventurer:a),
    dungeonWorlds:[{floor:7 as const,world:first.world}],
    dungeonFloors:[{floor:6,cleared:true}],
    events:[...initial.events,{
      id:`day-${day}:${hero.id}:dungeon-live:${committedTick}`,
      day,type:"dungeon-live" as const,worldTick:committedTick,adventurerId:hero.id,
      message:"Recorded normal Floor-7 expedition.",dungeonReplay:first.replay,
    }],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(saved))),saved,
    "v14 campaign saves must accept actual elite ability and historical frames");
});

test("ordinary first-generation Floor 7 encounters do not silently become bosses",()=>{
  const layout=generateDungeonLayout(7351,7);
  const monster=layout.features.find(f=>f.kind==="monster"&&
    tileAt(layout,f.x,f.z)==="room")!;
  const approach=dungeonNeighbors(layout,monster)[0];
  const index=monster.z*layout.width+monster.x;
  const world:SpatialDungeonWorld={
    resolvedFeatureIds:layout.features.filter(f=>f.id!==monster.id).map(f=>f.id),
    heroes:[{heroId:dungeonHero().id,x:approach.x,z:approach.z,
      visited:layout.tiles.map((kind,i)=>kind!=="wall"&&i!==index?i:-1)
        .filter(i=>i>=0)}],
  };
  const result=simulateSpatialDungeonDay(dungeonHero(),world,7351,12);
  assert.equal(result.replay.encounters.length,1);
  assert.equal(result.replay.encounters[0].combat.actors.some(actor=>
    actor.specialAbility==="grapple-throw"),false);
});

test("stair search uses genuine sight and co-located knowledge without inventing walked cells",()=>{
  const map=generateExpeditionLayout(7351,5),target=dungeonDownStair(map);
  const path=dungeonShortestPath(map,map.entrance,target);
  assert(path.length>3);
  const index=(p:{x:number;z:number})=>p.z*map.width+p.x;
  const approach=path.at(-2)!;
  const walked=path.slice(0,-1).map(index);
  const a={heroId:"a",...approach,visited:[index(approach)]};
  const b={heroId:"b",...approach,visited:walked};
  assert.equal(chooseKnownRouteStep(map,a,target),null);
  const before=structuredClone([a,b]);
  assert.deepEqual(chooseDungeonTransitionRoute(map,[a,b],target),
    {kind:"observed-route",step:target});
  assert.deepEqual([a,b],before);
  const current=path[1],lead={heroId:"a",...current,visited:path.slice(0,2).map(index)};
  const guide={heroId:"b",...current,visited:path.map(index)};
  assert.deepEqual(chooseDungeonTransitionRoute(map,[lead,guide],target),
    {kind:"walked-route",step:path[2]});
  assert.deepEqual(chooseDungeonTransitionRoute(map,[guide,lead],target),
    {kind:"walked-route",step:path[2]});
  assert.deepEqual(chooseDungeonTransitionRoute(map,[{...lead,...target}],target),
    {kind:"at-stair",step:null});
});

test("uninterrupted physical stair search terminates on all audit maps without hidden shortcuts",()=>{
  for(const seed of [7351,42,2026,9321])for(let floor=1;floor<=9;floor++){
    const map=generateExpeditionLayout(seed,floor),target=dungeonDownStair(map);
    const index=(p:{x:number;z:number})=>p.z*map.width+p.x;
    let progress={heroId:"walker",...map.entrance,visited:[index(map.entrance)]};
    // No combat or tactical diversion in this narrow navigation regression.
    // The real integrated audit still exercises both on its normal clock.
    let reached=false;
    for(let step=0;step<map.tiles.length*4;step++){
      const route=chooseDungeonTransitionRoute(map,[progress],target);
      if(route.kind==="at-stair"){reached=true;break;}
      assert(route.step,seed+":"+floor+" blocked before reaching the stair");
      assert(dungeonNeighbors(map,progress).some(p=>p.x===route.step!.x&&p.z===route.step!.z));
      if(route.kind==="frontier")assert.deepEqual(route.step,chooseSpatialDungeonStep(map,progress),
        "A hidden stair must not guide frontier selection");
      const cell=index(route.step);
      progress={...progress,...route.step,visited:progress.visited.includes(cell)?
        progress.visited:[...progress.visited,cell]};
    }
    assert(reached,seed+":"+floor+" failed bounded physical stair search");
  }
});
