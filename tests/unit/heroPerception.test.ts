import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDungeonLineOfSight,dungeonCurrentSight,dungeonExploredSight,
  selectHeroFloorPerception,HERO_SIGHT_RADIUS,
} from "../../src/game/heroPerception.ts";
import type {DungeonLayout} from "../../src/game/dungeonLayout.ts";
import type {LiveFloorHero,LiveFloorSpectatorFrame}
  from "../../src/game/liveFloorSpectator.ts";

const idx=(x:number,z:number)=>z*9+x;
const layout=():DungeonLayout=>{
  const tiles:Array<"wall"|"corridor">=Array(81).fill("corridor");
  tiles[idx(3,2)]="wall"; // An actual blocking wall between observers.
  tiles[idx(6,5)]="wall";
  return {version:1,floor:1,seed:123,width:9,height:9,tiles,
    entrance:{x:1,z:1},rooms:[],features:[
      {id:"monster-1",kind:"monster",subtype:"ghoul",x:5,z:2},
      {id:"monster-2",kind:"monster",subtype:"ghoul",x:2,z:3},
    ]};
};
function hero(id:string,x:number,z:number,
  visited:number[],partyMemberIds:string[]=[]):LiveFloorHero {
  return {id,name:id,role:"DPS",level:2,
    stats:{strength:6,agility:8,intellect:5,maxHealth:40},
    traits:{positive:"careful",neutral:"quiet",negative:"stubborn"},
    inventory:{bread:1,healing:0},equipment:{weapon:null,armor:null},
    x,z,visited,health:40,gold:5,partyMemberIds,
    partyId:partyMemberIds.length>1?"party:one":null,inCombat:false,
    goal:null,plannedAction:null,activity:"exploring"};
}
const frame=(...heroes:LiveFloorHero[]):LiveFloorSpectatorFrame=>({
  day:1,worldTick:600,floor:1,heroes,fights:[],resolved:[],
});

test("wall blocks deeper squares and adjacent walls are visible",()=>{
  const map=layout();
  assert.equal(HERO_SIGHT_RADIUS,5);
  assert.equal(hasDungeonLineOfSight(map,{x:2,z:2},{x:3,z:2}),true);
  assert.equal(hasDungeonLineOfSight(map,{x:2,z:2},{x:4,z:2}),false);
  assert.equal(hasDungeonLineOfSight(map,{x:2,z:2},{x:5,z:2}),false);
  assert.equal(hasDungeonLineOfSight(map,{x:2,z:2},{x:2,z:3}),true);
  assert.equal(hasDungeonLineOfSight(map,{x:2,z:2},{x:8,z:2}),false);
  assert.equal(dungeonCurrentSight(map,{x:2,z:2}).has(idx(3,2)),true);
  assert.equal(dungeonCurrentSight(map,{x:2,z:2}).has(idx(4,2)),false);
});

test("two blocked cardinal corner walls prevent seeing diagonally through",()=>{
  const tiles:Array<"wall"|"corridor">=Array(81).fill("corridor");
  tiles[idx(2,1)]="wall";tiles[idx(1,2)]="wall";
  const map={...layout(),tiles};
  assert.equal(hasDungeonLineOfSight(map,{x:1,z:1},{x:2,z:2}),false);
  assert.equal(hasDungeonLineOfSight(map,{x:1,z:1},{x:2,z:1}),true);
});

test("each hero retains their own explored view, never the union of every adventurer",()=>{
  const map=layout();
  const a=hero("a",2,2,[idx(2,2)]);
  const b=hero("b",5,2,[idx(5,2)]);
  const c=hero("c",2,3,[idx(2,3)]);
  const original=frame(a,b,c);
  const snapshot=structuredClone(original);
  const seenA=selectHeroFloorPerception(map,original,"a")!;
  const seenB=selectHeroFloorPerception(map,original,"b")!;
  assert(seenA.visibleHeroIds.includes("c"));
  assert(!seenA.visibleHeroIds.includes("b"));
  assert(seenB.visibleMonsterIds.includes("monster-1"));
  assert(seenA.visibleMonsterIds.includes("monster-2"));
  assert(!seenA.visibleMonsterIds.includes("monster-1"));
  assert(!seenA.explored.has(idx(5,2)));
  assert(seenB.explored.has(idx(5,2)));
  assert(seenA.explored.has(idx(3,2)));
  assert.deepEqual(original,snapshot);
  assert.equal(selectHeroFloorPerception(map,original,"missing"),null);
  assert.equal(selectHeroFloorPerception({...map,floor:2},original,"a"),null);
});

test("exploration remembers actual self-visited sight, not unvisited all-floor geography",()=>{
  const map=layout();
  const first=dungeonExploredSight(map,[idx(2,2)]);
  const path=[idx(2,2),idx(4,4)];
  const remembered=dungeonExploredSight(map,path);
  const current=dungeonCurrentSight(map,{x:2,z:2});
  assert(remembered.size>first.size);
  assert([...current].every(cell=>first.has(cell)));
  assert.equal(dungeonExploredSight(map,path),remembered,
    "Immutable path/geometry reuse the cached result");
  const other=layout();
  assert.notEqual(dungeonExploredSight(other,path),remembered);
});

test("party contacts are shared for current view only, not pasted into memories",()=>{
  const map=layout();
  const a=hero("a",2,2,[idx(2,2)],["a","c"]);
  const c=hero("c",2,2,[idx(2,2)],["a","c"]);
  const b=hero("b",5,2,[idx(5,2)]);
  const view=selectHeroFloorPerception(map,frame(a,b,c),"a")!;
  assert.deepEqual(view.partyVisibleHeroIds,view.visibleHeroIds
    .filter(id=>id!=="c").sort().concat(["c"]).sort());
  assert(!view.partyVisibleHeroIds.includes("b"));
  const resolved=selectHeroFloorPerception(map,{
    ...frame(a,b,c),resolved:["monster-2"],
  },"a")!;
  assert(!resolved.visibleMonsterIds.includes("monster-2"));
});
