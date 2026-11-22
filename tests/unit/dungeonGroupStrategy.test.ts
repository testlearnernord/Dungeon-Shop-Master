import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {
  generateExpeditionLayout,dungeonNeighbors,
} from "../../src/game/dungeonLayout.ts";
import {
  chooseSpatialDungeonStep,choosePartyDungeonStep,
  type SpatialDungeonHeroProgress,
} from "../../src/game/spatialDungeonExploration.ts";
import {
  negotiatePartyFloorDecisions,
} from "../../src/game/dungeonParties.ts";
import type {HeroDungeonDecision} from "../../src/game/dungeonDecisions.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";

const SEED=7351;
function heroes():AdventurerState[]{
  return createGameState(SEED).adventurers.slice(0,3).map((hero,index)=>({
    ...hero,status:"exploring" as const,floor:1 as const,
    role:(["tank","healer","DPS"] as const)[index],
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    traits:{positive:"brave",neutral:"quiet",negative:"stubborn"},
    health:hero.stats.maxHealth,
  }));
}
const decision=(goal:HeroDungeonDecision["goal"],action:HeroDungeonDecision["action"]):
  HeroDungeonDecision=>({goal,action});
function negotiate(
  group:readonly AdventurerState[],items:readonly HeroDungeonDecision[],
):readonly HeroDungeonDecision[]{
  const byId=new Map(group.map((hero,index)=>[hero.id,items[index]]));
  const input=structuredClone([...byId]);
  const output=negotiatePartyFloorDecisions(group,byId);
  assert.deepEqual([...byId],input,"Source proposals must be immutable");
  return group.map(hero=>output.get(hero.id)!);
}

test("voluntary companions choose safe descent over solo gear testing",()=>{
  const group=heroes().slice(0,2);
  const intentions=[decision("progress","descend"),decision("test-gear","stay")];
  assert.deepEqual(negotiate(group,intentions),[
    decision("progress","descend"),decision("test-gear","descend"),
  ],"A healthy armed companion can decide to try a deeper level");
  assert.deepEqual(negotiate([group[1],group[0]],intentions.toReversed()),
    [decision("test-gear","descend"),decision("progress","descend")],
    "Roster order cannot change the negotiated intent");
});

test("risk vetoes descent; patient heroes may wait but never heal for free",()=>{
  const [first,second]=heroes();
  const injured={...second,health:Math.round(second.stats.maxHealth*0.68)};
  const patient={...first,traits:{...first.traits,positive:"generous"}};
  const go=decision("progress","descend");
  const wait=decision("caution","stay");
  assert.deepEqual(negotiate([patient,injured],[go,wait]),[
    decision("progress","stay"),wait,
  ],"Generous explorers can wait for an injured companion");
  const impatient={...patient,traits:{...patient.traits,negative:"reckless"}};
  assert.deepEqual(negotiate([impatient,injured],[go,wait]),[go,wait],
    "No party leader forces a reckless adventurer to delay");
  const noSupplies={...injured,equipment:{weapon:null,armor:null}};
  assert.deepEqual(negotiate([first,noSupplies],[go,wait]),[go,wait]);
});

test("cautious climbers may be escorted but shop, death and opposite directions are hard limits",()=>{
  const [first,second]=heroes();
  const escort={...second,role:"healer" as const};
  const climb=decision("caution","ascend"),stay=decision("farm","stay");
  assert.deepEqual(negotiate([first,escort],[climb,stay]),[
    climb,decision("farm","ascend"),
  ]);
  const unsupported={...escort,role:"DPS" as const};
  assert.deepEqual(negotiate([first,unsupported],[climb,stay]),[climb,stay]);
  const shop=decision("resupply","shop");
  assert.deepEqual(negotiate([first,escort],[shop,stay]),[shop,stay],
    "Nobody votes away a genuine resupply need");
  assert.deepEqual(negotiate([first,escort],[climb,decision("progress","descend")]),
    [climb,decision("progress","descend")],
    "Ascend and descend goals are irreconcilable");
  const fallen={...escort,status:"dead" as const,health:0};
  assert.deepEqual(negotiate([first,fallen],[climb,stay]),[climb,stay]);
  assert.deepEqual(negotiate([first],[climb]),[climb],
    "Solo strategy is not modified by absent companions");
});

test("route voting uses only known lawful edges and is deterministic under roster reordering",()=>{
  const layout=generateExpeditionLayout(SEED,1);
  let pivot:{x:number;z:number}|null=null;
  let neighbors:ReturnType<typeof dungeonNeighbors>=[];
  for(let z=0;z<layout.height&&!pivot;z++)for(let x=0;x<layout.width;x++){
    const adjacent=dungeonNeighbors(layout,{x,z}).sort((a,b)=>a.z-b.z||a.x-b.x);
    if(adjacent.length>=2){pivot={x,z};neighbors=adjacent;break;}
  }
  assert(pivot&&neighbors.length>=2);
  const base=(p:{x:number;z:number})=>p.z*layout.width+p.x;
  const [left,right]=neighbors;
  const current=pivot;
  const voteLeft:SpatialDungeonHeroProgress={heroId:"adventurer-1",
    ...current,visited:[base(current),base(right)]};
  const voteRight:SpatialDungeonHeroProgress={heroId:"adventurer-2",
    ...current,visited:[base(current),base(left)]};
  const tie=choosePartyDungeonStep(layout,[voteRight,voteLeft]);
  assert.deepEqual(tie,left,
    "A tie must resolve through stable map coordinates, never array order");
  assert.deepEqual(choosePartyDungeonStep(layout,[voteLeft,voteRight]),tie);
  const majority=choosePartyDungeonStep(layout,[
    voteRight,voteLeft,{...voteRight,heroId:"adventurer-3"},
  ]);
  assert.deepEqual(majority,right,
    "Two votes for the other direction must beat the coordinate tie-break");
  assert.notDeepEqual(majority,tie,
    "Consensus must genuinely differ from a split vote");
  assert.deepEqual(choosePartyDungeonStep(layout,[
    {...voteRight,heroId:"adventurer-3"},voteLeft,voteRight,
  ]),majority,"Voting must not change when the roster is re-sorted");
  assert.deepEqual(choosePartyDungeonStep(layout,[voteLeft]),
    chooseSpatialDungeonStep(layout,voteLeft),"Solo route must be identical");
  assert(dungeonNeighbors(layout,current).some(p=>p.x===majority?.x&&p.z===majority?.z));
  assert.throws(()=>choosePartyDungeonStep(layout,[
    voteLeft,{...voteRight,x:left.x,z:left.z},
  ]),/separate tiles/);
  const none:[SpatialDungeonHeroProgress,SpatialDungeonHeroProgress]=[
    {...voteLeft,visited:layout.tiles.map((t,i)=>t==="wall"?-1:i).filter(i=>i>=0)},
    {...voteRight,visited:layout.tiles.map((t,i)=>t==="wall"?-1:i).filter(i=>i>=0)},
  ];
  assert.equal(choosePartyDungeonStep(layout,none),null,
    "Explored floors should use the existing renewable-site route fallback");
});

test("real multi-day party strategy is reproducible after a v13 save/reload",()=>{
  const initial=createGameState(SEED);
  const first=heroes();
  const layout=generateExpeditionLayout(SEED,1);
  const entry=layout.entrance;
  const starting={
    ...initial,
    adventurers:initial.adventurers.map(h=>{
      const member=first.find(f=>f.id===h.id);
      return member??h;
    }),
    dungeonWorlds:[{floor:1 as const,world:{
      resolvedFeatureIds:[] as string[],heroes:first.map(h=>({
        heroId:h.id,...entry,
        visited:[entry.z*layout.width+entry.x],
      })),
    }}],
    dungeonParties:[{memberIds:first.map(h=>h.id),floor:1 as const,formedDay:1}],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(starting))),starting);
  let continuous=starting;
  let resumed=parseSave(JSON.stringify(createSave(starting)));
  for(let i=0;i<18;i++){
    const a=advanceDay(continuous),b=advanceDay(resumed);
    assert.deepEqual(b.events,a.events,"Same actions, decisions and recordings");
    continuous=a.state;
    resumed=parseSave(JSON.stringify(createSave(b.state)));
    assert.deepEqual(resumed,continuous,"No hidden party RNG or re-resolved fight");
    const active=continuous.dungeonParties??[];
    assert(active.every(group=>group.memberIds.length>=2&&group.memberIds.length<=3));
    const unique=active.flatMap(group=>group.memberIds);
    assert.equal(unique.length,new Set(unique).size);
    const dayRecords=a.events.filter(e=>e.type==="dungeon-exploration");
    const played=new Set(dayRecords.map(e=>e.adventurerId));
    assert.equal(dayRecords.length,played.size,
      "A hero cannot be re-simulated as both companion and solo traveler");
    assert(dayRecords.every(e=>e.floorAction!==undefined||
      !e.dungeonReplay||e.dungeonReplay.outcome==="death"),
      "Only a dead hero can have actual expedition footage but no next floor choice");
  }
});
