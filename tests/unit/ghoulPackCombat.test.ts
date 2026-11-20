import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors,tileAt}
  from "../../src/game/dungeonLayout.ts";
import {ghoulPackActorId,ghoulPackCount,MAX_GHOUL_PACK}
  from "../../src/game/ghoulPack.ts";
import {prepareSpatialDungeonCombat,emptyLevel7World}
  from "../../src/game/level7Exploration.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("pack IDs are real stable combat participants, never extra map features",()=>{
  assert.equal(MAX_GHOUL_PACK,3);
  assert.deepEqual(Array.from({length:3},(_,i)=>ghoulPackActorId("ghoul:7",i)),
    ["ghoul:7","ghoul:7:pack:1","ghoul:7:pack:2"]);
  assert.throws(()=>ghoulPackActorId("site",3),RangeError);
  assert.equal(ghoulPackCount(7351,1,4,4,0,3,12),1);
  assert(ghoulPackCount(7351,3,4,4,0,3,12)>=2);
  assert(ghoulPackCount(7351,3,4,4,0,1,12)<=2);
  assert.equal(ghoulPackCount(7351,3,4,4,0,3,0),1);
});

test("deeper seeded 3-hero party faces 2-3 actual Ghouls at distinct walkable positions",()=>{
  const seed=7351;
  const initial=createGameState(seed);
  const layout=generateExpeditionLayout(seed,3);
  const site=layout.features.find(f=>f.kind==="monster"&&
    dungeonNeighbors(layout,f).length>0);
  assert(site);
  const approach=dungeonNeighbors(layout,site)[0];
  const heroes=initial.adventurers.slice(0,3).map(hero=>({
    ...hero,status:"exploring" as const,floor:3 as const,
    health:hero.stats.maxHealth,
  }));
  const a=prepareSpatialDungeonCombat(heroes,site,layout.seed,layout,approach,0);
  const b=prepareSpatialDungeonCombat([...heroes],site,layout.seed,layout,approach,0);
  assert.deepEqual(a,b);
  const actors=a.options.actors;
  const monsters=actors.filter(spec=>spec.team==="monsters");
  assert(monsters.length>=2&&monsters.length<=3);
  assert.equal(actors.length,heroes.length+monsters.length);
  assert.deepEqual(monsters.map(m=>m.id),monsters.map((_,i)=>
    ghoulPackActorId(site.id,i)));
  assert(monsters.every(m=>m.specialAbility===undefined),
    "Only unique bosses gain Troll abilities");
  assert.equal(new Set(actors.map(a=>a.id)).size,actors.length);
  const positions=actors.map(a=>a.x+","+a.z);
  assert.equal(new Set(positions).size,positions.length,
    "No real pack member spawns inside a party member");
  for(const actor of actors){
    const x=site.x+actor.x/2.5,z=site.z+actor.z/2.5;
    assert.notEqual(tileAt(layout,x,z),"wall");
  }
  const fight=resolveGroupCombat(a.options,25);
  const reordered=resolveGroupCombat({...a.options,
    actors:[...a.options.actors].reverse()},25);
  assert.deepEqual(fight,reordered,"Cast order cannot reroll a pack fight");
  assert(fight.replay.frames.length>2);
  assert(fight.replay.frames.every(frame=>frame.actors.length===actors.length));
  assert.equal(fight.replay.version,1);
  assert.equal(fight.state.events.length,fight.replay.cues.length);
});

test("single authored Ghoul pack LIVE combat saves and reloads one authoritative 60Hz state",()=>{
  // Find a deterministic seeded site with two Ghoul actors. Do not fabricate
  // encounters: use the same monster / nearest passage fixtures as LIVE.
  let fixture:null|{seed:number;site:ReturnType<typeof generateExpeditionLayout>["features"][number];
    approach:{x:number;z:number};layout:ReturnType<typeof generateExpeditionLayout>}=null;
  for(let seed=7351;seed<7380&&!fixture;seed++){
    const layout=generateExpeditionLayout(seed,3);
    for(const site of layout.features.filter(f=>f.kind==="monster")){
      const approach=dungeonNeighbors(layout,site)[0];
      if(!approach)continue;
      const hero={...createGameState(seed).adventurers[0],
        status:"exploring" as const,floor:3 as const};
      const battle=prepareSpatialDungeonCombat([hero],site,layout.seed,
        layout,approach);
      if(battle.options.actors.filter(a=>a.team==="monsters").length>=2){
        fixture={seed,layout,site,approach};break;
      }
    }
  }
  assert(fixture,"Expected a genuinely generated two-Ghoul pack");
  const {seed,site,approach,layout}=fixture;
  const initial=createGameState(seed);
  const hero=initial.adventurers.find(a=>a.status==="exploring")!;
  const active={...hero,status:"exploring" as const,floor:3 as const};
  const targetIndex=site.z*layout.width+site.x;
  const visited=layout.tiles.flatMap((tile,index)=>
    tile!=="wall"&&index!==targetIndex?[index]:[]);
  const positioned={...initial,
    adventurers:initial.adventurers.map(a=>a.id===active.id?active:a),
    earlyDungeonWorlds:[{floor:3 as const,world:{
      ...emptyLevel7World(),heroes:[{
        heroId:active.id,...approach,visited,
      }],
    }}],
  };
  const a=new GameStore(positioned);
  a.enableLiveDungeon();
  a.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const encounter=a.state.liveDungeon.combats.find(c=>c.heroIds.includes(active.id));
  assert(encounter,"An actual adjacent pack must start a real LIVE fight");
  const monsters=encounter.state.actors.filter(actor=>actor.team==="monsters");
  assert(monsters.length>=2);
  assert.equal(encounter.frames.length,1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(a.state))),a.state);
  a.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS*2);
  const b=new GameStore(parseSave(JSON.stringify(createSave(a.state))));
  a.advanceWorldTime(320);
  b.advanceWorldTime(320);
  assert.deepEqual(a.state,b.state,"Reload preserves every packed fighter and reward");
  const ids=a.state.events.map(e=>e.id);
  assert.equal(ids.length,new Set(ids).size,
    "One authored site must settle once despite multiple Ghoul bodies");
});
