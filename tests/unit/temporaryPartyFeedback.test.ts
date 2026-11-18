import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
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
      return match??{...hero,status:"at-shop" as const,floor:5 as const,
        shopStayDays:0};
    }),
    earlyDungeonWorlds:[{floor:1 as const,world}],
  };
}

test("day settlement commits real Temporary Party feed entries and historical member snapshot",()=>{
  const first=preparedDay();
  const second=advanceDay(first);
  assert.deepEqual(second,advanceDay(first),
    "Actual membership and feed must remain deterministic");
  const joins=second.events.filter(event=>event.type==="temporary-party-join");
  assert.deepEqual(joins.map(event=>event.adventurerId),[a,b]);
  assert(joins.every(event=>event.message.includes("Temporary Party")));
  assert(joins.every(event=>reportCategory(event)==="dungeon"));
  assert(joins.every(event=>reportIcon(event)==="swords"));
  const recorded=second.events.filter(event=>event.type==="dungeon-exploration");
  assert.equal(recorded.length,2);
  for(const event of recorded){
    assert.deepEqual(event.dungeonReplay?.partyMemberIds,[a,b]);
    assert(event.dungeonReplay?.partyMemberIds?.includes(event.adventurerId!));
    assert.deepEqual(event.dungeonReplay?.partyAppearances?.map(hero=>hero.id),
      [a,b],"A peaceful group expedition must still know both historical models");
    assert(event.dungeonReplay?.partyAppearances?.every(hero=>
      hero.equipment.weapon==="Iron Sword"&&
      hero.equipment.armor==="Leather Vest"));
  }
  const partyNumber=temporaryPartyNumber(second.state,a);
  assert.equal(partyNumber,1);
  assert.equal(temporaryPartyNumber(second.state,b),partyNumber);
  assert.equal(partySizeLabel(second.state,a)," · Temporary Party #1 (2)");
  assert.equal(partySizeLabel(second.state,b)," · Temporary Party #1 (2)");
  assert.deepEqual(rosterPartyDetails(second.state,a)?.members.map(h=>h.id),[a,b]);
  assert.deepEqual(parseSave(JSON.stringify(createSave(second.state))),second.state,
    "Strict version-13 save must preserve true historical party and feed events");

  const saved=structuredClone(createSave(second.state));
  const firstTape=saved.payload.events.find(event=>event.dungeonReplay)?.dungeonReplay;
  assert(firstTape);
  delete (firstTape as {partyMemberIds?:readonly string[]}).partyMemberIds;
  delete (firstTape as {partyAppearances?:unknown}).partyAppearances;
  assert.doesNotThrow(()=>parseSave(JSON.stringify(saved)),
    "Older v1 recordings with no historical party metadata still load");
  const previousPhase=structuredClone(createSave(second.state));
  const priorReplay=previousPhase.payload.events.find(event=>event.dungeonReplay)!
    .dungeonReplay!;
  delete (priorReplay as {partyAppearances?:unknown}).partyAppearances;
  assert.doesNotThrow(()=>parseSave(JSON.stringify(previousPhase)),
    "Earlier Temporary Party recordings without visual snapshots remain valid");

  for(const mutate of [
    (tape:NonNullable<typeof priorReplay>)=>{
      (tape.partyAppearances![1].equipment as {armor:string|null}).armor="Dragon Plate";
    },
    (tape:NonNullable<typeof priorReplay>)=>{
      (tape.partyAppearances![1] as {role:string}).role="monster";
    },
    (tape:NonNullable<typeof priorReplay>)=>{
      (tape.partyAppearances as unknown[]).pop();
    },
    (tape:NonNullable<typeof priorReplay>)=>{
      (tape.partyAppearances![0] as {id:string}).id=b;
    },
    (tape:NonNullable<typeof priorReplay>)=>{
      (tape.partyAppearances![0] as {equipment:{weapon:string|null}}).equipment.weapon=null;
    },
  ]){
    const tampered=structuredClone(createSave(second.state));
    const tape=tampered.payload.events.find(event=>event.dungeonReplay)!
      .dungeonReplay!;
    mutate(tape);
    assert.throws(()=>parseSave(JSON.stringify(tampered)),/partyAppearances/,
      "Saved historical participant models must match actual party and purchased gear");
  }

  for(const corrupt of [
    [a,a],
    [a,"adventurer-999999"],
    [b,c],
    [a,b,c,a],
  ]){
    const altered=structuredClone(createSave(second.state));
    const tape=altered.payload.events.find(event=>event.dungeonReplay)!.dungeonReplay!;
    (tape as {partyMemberIds:readonly string[]}).partyMemberIds=corrupt;
    assert.throws(()=>parseSave(JSON.stringify(altered)),/partyMemberIds/);
  }
  const forged=structuredClone(createSave(second.state));
  const partyEvent=forged.payload.events.find(event=>
    event.type==="temporary-party-join")!;
  partyEvent.id="day-2:"+a+":temporary-party-leave";
  assert.throws(()=>parseSave(JSON.stringify(forged)),/id|unique/,
    "Party feed records must retain canonical event identity");
});
