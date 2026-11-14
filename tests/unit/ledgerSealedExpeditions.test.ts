import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay,type WorldEvent} from "../../src/game/gameState.ts";
import {sealedExpeditionDossiers,sealedExpeditionCounts} from "../../src/ledgerSealedExpeditions.ts";

const replay=(id:string,day:number,type:"level6-combat"|"level7-exploration"):
WorldEvent=>({
  id:"day-"+day+":"+id+":"+type,
  day,adventurerId:id,type,
  message:"SECRET OUTCOME: death, gold +999, rare loot",
  combatOutcome:"death",
  ...(type==="level6-combat"?
    {combatReplay:{} as NonNullable<WorldEvent["combatReplay"]>}:
    {level7Replay:{} as NonNullable<WorldEvent["level7Replay"]>}),
});

test("combat and exploration archives use only known recording metadata",()=>{
  const before=createGameState(7351);
  const after=advanceDay(before).state;
  const [first,second]=before.adventurers;
  const events=[replay(first.id,after.day,"level6-combat"),
    replay(second.id,after.day,"level7-exploration")];
  const dossiers=sealedExpeditionDossiers(before,after,events);
  assert.equal(dossiers.length,2);
  assert.equal(dossiers[0].recordId,events[0].id);
  assert.equal(dossiers[1].recordId,events[1].id);
  assert.deepEqual(dossiers.map(d=>d.floor),[6,7]);
  assert.deepEqual(dossiers.map(d=>d.category),
    ["COMBAT RECORDING","EXPLORATION RECORDING"]);
  assert.equal(dossiers[0].heroName,first.name);
  assert.equal(dossiers[1].heroName,second.name);
  assert.equal(dossiers[0].portrait,0);
  assert.equal(dossiers[1].portrait,1);
  assert.equal(dossiers[0].knownLevel,first.level);
  assert.deepEqual(sealedExpeditionCounts(dossiers),
    {total:2,combat:1,exploration:1});
  const labels=JSON.stringify(dossiers);
  assert(!/SECRET OUTCOME|death|gold \+999|rare loot|combatOutcome/i.test(labels));
});

test("new victories, deaths, XP and any replay content produce identical sealed dossier headers",()=>{
  const before=createGameState(7351);
  const after=advanceDay(before).state;
  const id=before.adventurers[0].id;
  const original=[replay(id,after.day,"level6-combat")];
  const baseline=sealedExpeditionDossiers(before,after,original);
  const manipulated={
    ...after,
    adventurers:after.adventurers.map(hero=>hero.id===id?{
      ...hero,status:"dead" as const,health:0,level:100,xp:999999,gold:999999,
      inventory:{...hero.inventory,loot:9999},
    }:hero),
  };
  const altered=[{...original[0],message:"VICTORY! treasure gained",
    combatOutcome:"victory" as const,
    combatReplay:{hiddenSecret:"DO NOT SHOW"} as unknown as
      NonNullable<WorldEvent["combatReplay"]>}];
  assert.deepEqual(sealedExpeditionDossiers(before,manipulated,altered),baseline);
  assert.equal(baseline[0].knownLevel,before.adventurers[0].level);
});

test("newly appearing and anonymous heroes cannot reveal a post-combat level",()=>{
  const before=createGameState(7351),after=advanceDay(before).state;
  const id="adventurer-999";
  const newcomers={...after,adventurers:[...after.adventurers,{
    ...after.adventurers[0],id,name:"Newcomer",role:"healer" as const,
    status:"dead" as const,level:99,xp:10000,
  }]};
  const dossiers=sealedExpeditionDossiers(before,newcomers,[
    replay(id,after.day,"level7-exploration"),
    {...replay(id,after.day,"level6-combat"),id:"anonymous",adventurerId:undefined},
  ]);
  assert.equal(dossiers[0].heroName,"Newcomer");
  assert.equal(dossiers[0].knownLevel,null);
  assert.equal(dossiers[0].role,"healer");
  assert.equal(dossiers[1].heroName,"Unknown adventurer");
  assert.equal(dossiers[1].portrait,null);
  assert.equal(dossiers[1].knownLevel,null);
});

test("archive projection does not modify replay sources or gameplay state",()=>{
  const before=createGameState(7351),after=advanceDay(before).state;
  const events=[replay(before.adventurers[0].id,after.day,"level6-combat")];
  const original=JSON.stringify({before,after,events});
  const first=sealedExpeditionDossiers(before,after,events);
  const again=sealedExpeditionDossiers(before,after,events);
  assert.deepEqual(first,again);
  assert.equal(JSON.stringify({before,after,events}),original);
  assert.deepEqual(sealedExpeditionCounts([]),{total:0,combat:0,exploration:0});
  assert.throws(()=>sealedExpeditionDossiers(before,after,[{
    id:"not-replay",type:"sale",day:after.day,message:"Not an expedition",
  }]),RangeError);
});
