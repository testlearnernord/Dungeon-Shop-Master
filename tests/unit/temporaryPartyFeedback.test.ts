import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {
  temporaryPartyChanges,type DungeonPartyState,
} from "../../src/game/dungeonParties.ts";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {
  partySizeLabel,temporaryPartyNumber,rosterPartyDetails,
} from "../../src/game/rosterView.ts";
import {reportCategory,reportIcon} from "../../src/reportPresentation.ts";

const a="adventurer-1",b="adventurer-2",c="adventurer-3";
const party=(ids:readonly string[],floor:1|2=1,day=2):DungeonPartyState=>({
  memberIds:ids,floor,formedDay:day,
});
const changes=(previous:readonly DungeonPartyState[],
  shared:readonly (readonly string[])[],current:readonly DungeonPartyState[])=>
  temporaryPartyChanges(previous,shared,current).map(change=>[
    change.action,change.heroId,change.memberIds.join(","),
  ]);

test("Temporary Party formation and unchanged companionship produce only truthful joins",()=>{
  assert.deepEqual(changes([],[[a,b]],[party([a,b])]),[
    ["join",a,a+","+b],["join",b,a+","+b],
  ]);
  assert.deepEqual(changes([party([a,b])],[[a,b]],[party([a,b],2)]),[],
    "Existing members do not re-join every day or after agreeing to change floor");
  assert.deepEqual(changes([party([a,b])],[[a,b,c]],[party([a,b,c])]),[
    ["join",c,[a,b,c].join(",")],
  ],"Only the actual newcomer joins an existing pair");
});

test("Temporary Party departures report separation and attrition without fake rejoining",()=>{
  assert.deepEqual(changes([party([a,b,c])],[[a,b]],[party([a,b])]),[
    ["leave",c,[a,b,c].join(",")],
  ],"A survivor pair remains the same companionship after one member departs");
  assert.deepEqual(changes([party([a,b])],[[a,b]],[]),[
    ["leave",a,[a,b].join(",")],["leave",b,[a,b].join(",")],
  ],"A group can fight together and dissolve later that same day");
  assert.deepEqual(changes([],[[a,b]],[]),[
    ["join",a,[a,b].join(",")],["join",b,[a,b].join(",")],
    ["leave",a,[a,b].join(",")],["leave",b,[a,b].join(",")],
  ],"Transient same-day cooperation is real, not omitted because it dissolved");
  assert.deepEqual(changes([party([a,b])],[[a,c]],[party([a,c])]),[
    ["leave",a,[a,b].join(",")],["leave",b,[a,b].join(",")],
    ["join",a,[a,c].join(",")],["join",c,[a,c].join(",")],
  ],"Changing partners records leaving an old party before joining a new one");
  assert.deepEqual(changes([party([a,b])],[],[]),[
    ["leave",a,[a,b].join(",")],["leave",b,[a,b].join(",")],
  ],"A party that never meets on the next day has genuinely dissolved");
});

function preparedDay(){
  const base=createGameState(7351);
  const layout=generateExpeditionLayout(base.seed,1);
  const openTiles=layout.tiles.flatMap((tile,index)=>tile!=="wall"?[index]:[]);
  const two=base.adventurers.slice(0,2).map(hero=>({
    ...hero,status:"exploring" as const,floor:1 as const,shopStayDays:0,
    health:hero.stats.maxHealth,
    traits:{...hero.traits,negative:"stubborn"},
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
  }));
  const world={
    resolvedFeatureIds:layout.features.map(feature=>feature.id),
    heroes:two.map(hero=>({
      heroId:hero.id,...layout.entrance,visited:openTiles,
    })),
  };
  return {...base,
    adventurers:base.adventurers.map(hero=>{
      const match=two.find(person=>person.id===hero.id);
      return match??{...hero,status:"at-shop" as const,floor:"shop" as const,
        shopStayDays:0};
    }),
    dungeonWorlds:[{floor:1 as const,world}],
  };
}

test("a genuine LIVE movement tick forms and reports a real Temporary Party",()=>{
  const initial=preparedDay(),store=new GameStore(initial);
  store.enableLiveDungeon();
  store.advanceWorldTime(200);
  const state=store.state;
  const joins=state.events.filter(event=>event.type==="temporary-party-join");
  assert.deepEqual(joins.map(event=>event.adventurerId),[a,b]);
  assert(joins.every(event=>event.worldTick===200),
    "Formation is committed on the real scheduled world clock");
  assert(joins.every(event=>reportCategory(event)==="dungeon"));
  assert(joins.every(event=>reportIcon(event)==="swords"));
  const group=state.dungeonParties?.find(p=>
    p.memberIds.includes(a)&&p.memberIds.includes(b));
  assert(group,"Two co-located consenting heroes must form a saved party");
  assert.equal(group!.formedDay,1);
  assert.equal(temporaryPartyNumber(state,a),temporaryPartyNumber(state,b));
  assert.equal(partySizeLabel(state,a)," · Temporary Party #1 (2)");
  assert.deepEqual(rosterPartyDetails(state,a)?.members.map(h=>h.id),[a,b]);
  const world=state.dungeonWorlds.find(entry=>entry.floor===group!.floor)?.world;
  assert(world?.heroes.some(h=>h.heroId===a)&&world.heroes.some(h=>h.heroId===b),
    "Members are physically present in one saved dungeon map");
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state,
    "Current save must persist the real co-located party and its feed");
});

