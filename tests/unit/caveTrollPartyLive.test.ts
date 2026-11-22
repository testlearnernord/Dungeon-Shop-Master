import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {activateLiveDungeon} from "../../src/game/liveDungeonRuntime.ts";
import {emptyLevel7World} from "../../src/game/level7Exploration.ts";
import {generateExpeditionLayout,dungeonShortestPath,dungeonDownStair}
  from "../../src/game/dungeonLayout.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {createGroupCombat,resolveGroupCombat} from "../../src/game/groupCombat.ts";
import {selectLiveFloorSpectatorFrame} from "../../src/game/liveFloorSpectator.ts";
import {projectWorldFeedChanges} from "../../src/game/worldFeedProjection.ts";
import {findCommittedDeathFootage} from "../../src/game/deathFootage.ts";

const SEED=7351;
function bossEntry(){
  const base=createGameState(SEED);
  const layout=generateExpeditionLayout(SEED,9);
  const down=dungeonDownStair(layout);
  const path=dungeonShortestPath(layout,layout.entrance,down);
  assert(path.length>=2);
  const visited=path.map(p=>p.z*layout.width+p.x);
  const selected=base.adventurers.slice(0,3).map(h=>{
    const veteran={...h,level:12,xp:1100,level6Permit:true,
      floor:9 as const,status:"exploring" as const,
      equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
      inventory:{...h.inventory,healing:3,bread:2}};
    return {...veteran,health:heroProgression(veteran).maxHealth};
  });
  const ids=selected.map(h=>h.id);
  const state={
    ...base,
    adventurers:base.adventurers.map(h=>selected.find(p=>p.id===h.id)??{
      ...h,floor:5 as const,status:"at-shop" as const,
    }),
    earlyDungeonWorlds:[{floor:9 as const,world:{
      ...emptyLevel7World(),
      heroes:selected.map(h=>({heroId:h.id,...down,visited})),
    }}],
    dungeonParties:[{floor:9 as const,memberIds:ids,formedDay:1}],
  };
  const active=activateLiveDungeon(state);
  const withPlans={...active,liveDungeon:{...active.liveDungeon,
    plans:ids.map(heroId=>({heroId,floor:9 as const,
      goal:"progress" as const,action:"descend" as const,
      updatedTick:0})),
  }};
  return {state:withPlans,ids};
}

test("real Floor-9 stair commits exactly one party boss, with 60Hz saved fighters and prominent World Feed",()=>{
  const {state,ids}=bossEntry();
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state);
  const store=new GameStore(state);
  store.advanceWorldTime(200);
  const battle=store.state.liveDungeon.partyBossCombat;
  assert(battle,"Committed group crossed real Floor-9 stair to the boss chamber");
  assert.deepEqual(battle.heroIds,ids);
  assert.equal(battle.options.actors.length,4);
  assert.equal(battle.options.actors.filter(a=>a.specialAbility==="grapple-throw").length,1);
  assert.equal(battle.options.actors.at(-1)?.maxHp,700);
  assert(store.state.adventurers.filter(h=>
    ids.includes(h.id)&&h.floor===10&&h.status==="expedition").length===3);
  const view=selectLiveFloorSpectatorFrame(store.state,10)!;
  assert.equal(view.fights.length,1);
  assert.equal(view.fights[0].id,battle.id);
  assert.deepEqual(view.fights[0].heroIds,ids);
  const notices=projectWorldFeedChanges(state,store.state);
  const attempt=notices.find(n=>n.category==="boss"&&n.id.includes("boss-party"));
  assert(attempt,"Real party challenge generates a top-priority event");
  assert.equal(attempt.priority,3);
  assert.equal(attempt.target.kind,"combat");
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  store.advanceWorldTime(40);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state,
    "Mid-party-boss reload must retain the one original 60Hz motor");
});

test("party boss outcome is deterministic through mid-fight reload with exactly one settlement",()=>{
  const {state,ids}=bossEntry();
  const original=new GameStore(state);
  original.advanceWorldTime(240);
  const checkpoint=parseSave(JSON.stringify(createSave(original.state)));
  const resumed=new GameStore(checkpoint);
  original.advanceWorldTime(2200);
  resumed.advanceWorldTime(2200);
  assert.deepEqual(original.state,resumed.state);
  assert.equal(original.state.liveDungeon.partyBossCombat,null);
  const archived=original.state.events.filter(e=>e.partyBossReplay);
  assert.equal(archived.length,1,
    "One shared immutable boss recording for the entire party, not one per hero.");
  const tape=archived[0].partyBossReplay!;
  assert.equal(tape.actors.length,4);
  assert.equal(tape.actors.at(-1)?.id,"cave-troll");
  assert(tape.frames.length>2);
  const historical=projectWorldFeedChanges(checkpoint,original.state);
  const result=historical.find(entry=>
    entry.id.startsWith("boss-result:"));
  assert(result,"Committed boss settlement must appear in World Feed.");
  assert.deepEqual(result.target,
    {kind:"party-boss-recording",eventId:archived[0].id},
    "Result opens preserved 60Hz footage, not a hero profile.");
  const forged=structuredClone(createSave(original.state));
  const recorded=forged.payload.events.find(e=>e.partyBossReplay)!;
  if(!recorded.partyBossReplay)throw new Error("No original tape");
  (recorded.partyBossReplay.actors.at(-1) as {maxHp:number}).maxHp=99999;
  assert.throws(()=>parseSave(JSON.stringify(forged)),/partyBossReplay/,
    "Save validator must reject fabricated boss health in historical footage.");
  const after=original.state.adventurers.filter(h=>ids.includes(h.id));
  assert.equal(after.length,3);
  assert(after.every(h=>h.status==="dead"||h.status==="at-shop"||
    h.status==="traveling"||h.status==="off-duty"));
  const battleResults=original.state.events.filter(e=>
    ids.includes(e.adventurerId??"")&&e.type==="dungeon-live"&&
    e.message.includes("Level-10 Cave Troll"));
  assert.equal(battleResults.length,3,"One real result per fighter, not one per 60Hz frame");
  const wasWon=original.state.dungeonFloors.some(f=>f.floor===10&&f.cleared);
  if(wasWon)assert(after.some(h=>h.health>0));
  for(const dead of after.filter(hero=>hero.status==="dead")){
    const signal=original.state.events.find(event=>
      event.type==="hero-death-signal"&&event.adventurerId===dead.id);
    assert(signal,"Fatal party battle must emit the real death signal.");
    assert.deepEqual(findCommittedDeathFootage(original.state,dead.id,signal.id),
      {kind:"party-boss-recording",eventId:archived[0].id},
      "Any dead member can review the ONE shared original boss footage.");
  }
  assert.deepEqual(parseSave(JSON.stringify(createSave(original.state))),
    original.state);
});

test("party gateway rejects solo or unauthorized attempts, and gear determines motor stats",()=>{
  const {state,ids}=bossEntry();
  const heroes=state.adventurers.filter(h=>ids.includes(h.id));
  const equipped=caveTrollPartyOptions(heroes,42);
  const unarmed=caveTrollPartyOptions(heroes.map(h=>({
    ...h,equipment:{weapon:null,armor:null},
  })),42);
  const a=equipped.actors.filter(x=>x.team==="heroes");
  const b=unarmed.actors.filter(x=>x.team==="heroes");
  assert(a.every((x,i)=>x.damage>b[i].damage&&x.armor>b[i].armor));
  assert.deepEqual(caveTrollPartyOptions(heroes,42),equipped);
  assert.throws(()=>caveTrollPartyOptions([heroes[0]],42),/party/);
  assert.throws(()=>caveTrollPartyOptions([
    {...heroes[0],level6Permit:false},heroes[1]],42),/party/);
  assert.equal(createGroupCombat(equipped).actors.length,4);
  const fight=resolveGroupCombat(equipped,90);
  const naked=resolveGroupCombat(unarmed,90);
  console.log("LEVEL10_BALANCE_PROBE",JSON.stringify({
    equipped:fight.state.outcome,unarmed:naked.state.outcome,
    equippedHeroHp:fight.state.actors.filter(a=>a.team==="heroes").map(a=>a.hp),
    unarmedHeroHp:naked.state.actors.filter(a=>a.team==="heroes").map(a=>a.hp),
    equippedBossHp:fight.state.actors.find(a=>a.id==="cave-troll")?.hp,
    unarmedBossHp:naked.state.actors.find(a=>a.id==="cave-troll")?.hp,
  }));
  assert.equal(fight.state.outcome,"heroes",
    "An equipped, healthy temporary party must be able to defeat the Level-10 boss");
  assert.notEqual(naked.state.outcome,"heroes",
    "An unequipped temporary party must not casually beat the Cave Troll");
  assert.equal(fight.replay.frames.length>1,true);
});
