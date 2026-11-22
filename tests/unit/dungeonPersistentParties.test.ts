import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import { createSave, parseSave } from "../../src/game/campaignSave.ts";
import {
  generateExpeditionLayout, dungeonNeighbors,
} from "../../src/game/dungeonLayout.ts";
import { emptyLevel7World, type Level7World } from "../../src/game/level7Exploration.ts";
import {
  choosePersistentDungeonParty, settlePersistentDungeonParties,
  type DungeonPartyState,
} from "../../src/game/dungeonParties.ts";
import { partySizeLabel } from "../../src/game/rosterView.ts";

const SEED=7351;
function preparedHeroes(){
  return createGameState(SEED).adventurers.slice(0,3).map((hero,index)=>({
    ...hero,
    status:"exploring" as const,floor:1 as const,shopStayDays:0,
    role:(["tank","healer","DPS"] as const)[index],
    traits:{...hero.traits,negative:"stubborn"},
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    health:hero.stats.maxHealth,
  }));
}
function savedPair():DungeonPartyState {
  return {memberIds:["adventurer-1","adventurer-2"],floor:1,formedDay:2};
}
function rosterWorld():Level7World {
  return emptyLevel7World();
}

test("a saved pair stays together ahead of an otherwise eligible outsider",()=>{
  const [first,second,outsider]=preparedHeroes();
  const order=[outsider,first,second];
  const layout=generateExpeditionLayout(SEED,1);
  const prior=[savedPair()];
  assert.deepEqual(choosePersistentDungeonParty(outsider,order,
    rosterWorld(),layout,new Set(),prior).map(h=>h.id),
    [outsider.id],"An outsider must not steal members of a real saved party");
  const retained=choosePersistentDungeonParty(second,order,rosterWorld(),
    layout,new Set(),prior);
  assert.deepEqual(retained.map(h=>h.id),[first.id,second.id],
    "The original pair retains leader and member ordering across sessions");
  const tired={...first,traits:{...first.traits,negative:"reckless"}};
  assert.deepEqual(choosePersistentDungeonParty(second,
    [tired,second,outsider],rosterWorld(),layout,new Set(),prior)
    .map(h=>h.id),[second.id,outsider.id],
    "A member can autonomously withdraw and allow a different formation");
});

test("consensual floor move keeps founding day but dissent or different map positions break up",()=>{
  const [one,two,three]=preparedHeroes();
  const group=[one.id,two.id,three.id];
  const previous:DungeonPartyState[]=[{
    memberIds:group,floor:1,formedDay:2,
  }];
  const nextRoster=[one,two,three].map(h=>({...h,floor:2 as const}));
  const world=(floor:number)=>floor===2?rosterWorld():rosterWorld();
  const descend=new Map(group.map(id=>[id,"descend" as const]));
  const settled=settlePersistentDungeonParties(previous,[group],
    nextRoster,world,SEED,3,descend);
  assert.deepEqual(settled,[{memberIds:group,floor:2,formedDay:2}]);
  const disagreement=new Map(descend);
  disagreement.set(two.id,"stay");
  assert.deepEqual(settlePersistentDungeonParties(previous,[group],
    nextRoster,world,SEED,3,disagreement),[],
    "Individual choices must never be overridden by the party leader");
  const layout=generateExpeditionLayout(SEED,2);
  const exit=dungeonNeighbors(layout,layout.entrance)[0];
  const worldAfterSplit:Level7World={
    resolvedFeatureIds:[],
    heroes:[{
      heroId:two.id,...exit,visited:[
        layout.entrance.z*layout.width+layout.entrance.x,
        exit.z*layout.width+exit.x,
      ],
    }],
  };
  assert.deepEqual(settlePersistentDungeonParties(previous,[group],
    nextRoster,()=>worldAfterSplit,SEED,3,descend),[],
    "A saved previous floor position cannot be overwritten to reunite companions");
});

test("one casualty removes the fallen member without resetting the survivors' friendship",()=>{
  const [a,b,c]=preparedHeroes();
  const previous:DungeonPartyState[]=[{
    memberIds:[a.id,b.id,c.id],floor:1,formedDay:2,
  }];
  const fallen={...c,health:0,status:"dead" as const};
  const survivors=settlePersistentDungeonParties(previous,
    [[a.id,b.id,c.id]],[a,b,fallen],()=>rosterWorld(),
    SEED,5,new Map([[a.id,"stay"],[b.id,"stay"]]));
  assert.deepEqual(survivors,[{
    memberIds:[a.id,b.id],floor:1,formedDay:2,
  }]);
});

test("new parties persist through a real confirmed floor transition and the following day",()=>{
  const base=createGameState(SEED);
  const [first,second]=preparedHeroes();
  const layout=generateExpeditionLayout(SEED,1);
  const known=layout.tiles.map((tile,i)=>tile==="wall"?-1:i).filter(i=>i>=0);
  const world:Level7World={
    resolvedFeatureIds:layout.features.map(f=>f.id),
    heroes:[first,second].map(hero=>({
      heroId:hero.id,...layout.entrance,visited:[...known],
    })),
  };
  const initial={
    ...base,
    adventurers:base.adventurers.map(h=>h.id===first.id?first:
      h.id===second.id?second:
      {...h,status:"at-shop" as const,floor:"shop" as const,shopStayDays:0}),
    dungeonWorlds:[{floor:1 as const,world}],
  };
  const firstDay=advanceDay(initial);
  assert.deepEqual(firstDay,advanceDay(initial),
    "Party decisions cannot depend on render order or a second RNG tick");
  const pair=firstDay.state.dungeonParties?.find(p=>
    p.memberIds.includes(first.id)&&p.memberIds.includes(second.id));
  assert(pair,"Prepared partners should agree to descend together");
  assert.deepEqual(pair.memberIds,[first.id,second.id]);
  assert(pair.floor>=2&&pair.floor<=9,
    "Autonomous heroes may cross more than one genuine staircase per live day");
  assert(pair.formedDay>=1&&pair.formedDay<=firstDay.state.day);
  const onFloor=firstDay.state.adventurers.filter(h=>
    pair.memberIds.includes(h.id));
  assert(onFloor.every(h=>h.floor===pair.floor&&h.status==="exploring"));
  assert.equal(partySizeLabel(firstDay.state,first.id)," · Temporary Party #1 (2)");
  assert.deepEqual(parseSave(JSON.stringify(createSave(firstDay.state))),
    firstDay.state);
  const continued=advanceDay(
    parseSave(JSON.stringify(createSave(firstDay.state))));
  const reports=continued.events.filter(e=>
    e.type==="dungeon-live"&&pair.memberIds.includes(e.adventurerId!));
  assert(reports.length>0,
    "Both autonomous companions remain on the one scheduled live world");
  const retained=continued.state.dungeonParties?.find(group=>
    pair.memberIds.every(id=>group.memberIds.includes(id)));
  if(retained){
    const members=continued.state.adventurers.filter(h=>
      retained.memberIds.includes(h.id));
    assert(members.every(h=>h.floor===retained.floor&&h.status==="exploring"),
      "If still grouped, companions share a genuine floor and alive status");
    assert.equal(retained.formedDay,pair.formedDay);
  }
  assert.deepEqual(parseSave(JSON.stringify(createSave(continued.state))),
    continued.state);
});

test("optional v13 groups round-trip; forged membership, time and position are rejected",()=>{
  const base=createGameState(SEED),[a,b]=preparedHeroes();
  const state={...base,adventurers:base.adventurers.map(hero=>
    hero.id===a.id?a:hero.id===b.id?b:hero),
    dungeonParties:[{memberIds:[a.id,b.id],floor:1 as const,formedDay:1}],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const old=structuredClone(createSave(state));
  delete (old.payload as {dungeonParties?:unknown}).dungeonParties;
  assert.doesNotThrow(()=>parseSave(JSON.stringify(old)),
    "Previously persisted version-13 campaigns have no groups field");

  const cases:[
    string,(x:ReturnType<typeof createSave>)=>void,RegExp,
  ][]=[
    ["duplicate",x=>{(x.payload.dungeonParties![0].memberIds as string[])[1]=a.id;},/unique/],
    ["dead",x=>{
      const hero=x.payload.adventurers.find(h=>h.id===b.id)!;
      hero.health=0;hero.status="dead";
    },/memberIds/],
    ["wrong floor",x=>{(x.payload.dungeonParties![0] as {floor:number}).floor=2;},/memberIds/],
    ["future founder",x=>{(x.payload.dungeonParties![0] as {formedDay:number}).formedDay=2;},/formedDay/],
    ["too many",x=>{(x.payload.dungeonParties![0].memberIds as string[]).push("adventurer-3","adventurer-4");},/memberIds/],
  ];
  for(const [name,edit,expected] of cases){
    const corrupt=structuredClone(createSave(state));
    edit(corrupt);
    assert.throws(()=>parseSave(JSON.stringify(corrupt)),expected,name);
  }
  const layout=generateExpeditionLayout(SEED,1);
  const other=dungeonNeighbors(layout,layout.entrance)[0];
  const apart=structuredClone(createSave(state));
  apart.payload.dungeonWorlds=[{floor:1,world:{
    resolvedFeatureIds:[],heroes:[
      {heroId:a.id,...layout.entrance,
        visited:[layout.entrance.z*layout.width+layout.entrance.x]},
      {heroId:b.id,...other,visited:[
        layout.entrance.z*layout.width+layout.entrance.x,
        other.z*layout.width+other.x,
      ]},
    ],
  }}];
  assert.throws(()=>parseSave(JSON.stringify(apart)),/physically share/);
});

test("dissolved relationships never survive at shop or appear from mere proximity",()=>{
  const [a,b]=preparedHeroes();
  const state=createGameState(SEED);
  assert.equal(partySizeLabel(state,a.id),"");
  const shop={...a,status:"traveling" as const,floor:4 as const};
  assert.deepEqual(settlePersistentDungeonParties([savedPair()],
    [[a.id,b.id]],[shop,b],()=>rosterWorld(),SEED,7,
    new Map([[a.id,"shop"],[b.id,"stay"]])),[]);
});
