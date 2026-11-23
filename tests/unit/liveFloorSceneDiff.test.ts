import assert from "node:assert/strict";
import test from "node:test";
import {sameLiveFloorMap,type FloorMapSnapshot}
  from "../../src/game/liveFloorSceneDiff.ts";

const hero={
  id:"hero-1",x:4,z:6,role:"tank" as const,
  equipment:{weapon:"Iron Sword" as const,armor:null},
  partyId:null,partyMemberIds:["hero-1"],inCombat:true,
  visited:[14,15,16],activity:"combat" as const,
  plannedAction:"stay" as const,goal:"farm" as const,
};
const fight={id:"encounter-1",x:4,z:6};
const floor:FloorMapSnapshot={
  floor:1,heroes:[hero],fights:[fight],resolved:["chest-1"],
};

test("HP, actor frames, gold and world ticks never trigger full LIVE map redraw",()=>{
  const old={...floor,worldTick:1200,heroes:[{...hero,health:80,gold:12}],
    fights:[{...fight,frames:[{hp:80}]}]};
  const latest={...old,worldTick:1210,
    heroes:[{...old.heroes[0],health:47,gold:19}],
    fights:[{...fight,frames:[{hp:47}]}]};
  assert(sameLiveFloorMap(old,latest));
  assert(sameLiveFloorMap(latest,latest));
  assert.equal(old.heroes[0].health,80,"The original combat snapshot stays immutable");
});

test("any spatial, party, goal, fog or fight change invalidates the map",()=>{
  const changed=[
    {...floor,floor:2 as const},
    {...floor,heroes:[{...hero,x:5}]},
    {...floor,heroes:[{...hero,z:7}]},
    {...floor,heroes:[{...hero,role:"healer" as const}]},
    {...floor,heroes:[{...hero,equipment:{weapon:null,armor:null}}]},
    {...floor,heroes:[{...hero,partyId:"party-1"}]},
    {...floor,heroes:[{...hero,partyMemberIds:["hero-1","hero-2"]}]},
    {...floor,heroes:[{...hero,inCombat:false}]},
    {...floor,heroes:[{...hero,activity:"backtracking" as const}]},
    {...floor,heroes:[{...hero,plannedAction:"shop" as const}]},
    {...floor,heroes:[{...hero,goal:"loot-chest" as const}]},
    {...floor,heroes:[{...hero,visited:[14,15,16,17]}]},
    {...floor,heroes:[{...hero,visited:[14,15,99]}]},
    {...floor,heroes:[]},
    {...floor,resolved:["chest-1","ghoul-2"]},
    {...floor,fights:[]},
    {...floor,fights:[{...fight,x:8}]},
    {...floor,fights:[{...fight,z:9}]},
    {...floor,fights:[{...fight,id:"encounter-2"}]},
  ];
  for(const frame of changed){
    assert.equal(sameLiveFloorMap(floor,frame),false,
      "Actual world map content must invalidate the scene");
  }
  assert.equal(sameLiveFloorMap(floor,
    {...floor,heroes:[{...hero,visited:[14,15,16]}]}),true,
    "New arrays with identical discovered tiles should not redraw fog");
});

test("pure comparison does not mutate the authoritative frame",()=>{
  const before=JSON.stringify(floor);
  assert(sameLiveFloorMap(floor,structuredClone(floor)));
  assert.equal(JSON.stringify(floor),before);
});

test("a renewed Ghoul generation changes the LIVE map even on the same tile",()=>{
  const pack={id:"floor1-monster-1",siteCycle:0,
    x:5,z:6,mode:"IDLE" as const,lastMoveTick:0};
  const from={...floor,monsters:[pack]};
  const same={...floor,monsters:[{...pack}]};
  assert.equal(sameLiveFloorMap(from,same),true);
  const renewed={...floor,monsters:[{...pack,siteCycle:1}]};
  assert.equal(sameLiveFloorMap(from,renewed),false,
    "a new site generation is a new physical Ghoul instance");
});
