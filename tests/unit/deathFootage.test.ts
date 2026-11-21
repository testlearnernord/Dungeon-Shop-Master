import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,type GameState} from "../../src/game/gameState.ts";
import {findCommittedDeathFootage} from "../../src/game/deathFootage.ts";

test("no magical-death source means no invented recording",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  assert.deepEqual(findCommittedDeathFootage(state,hero.id,"unknown"),
    {kind:"none"});
});

test("a real fatal trap opens its saved expedition, never a fabricated fight",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  const signal={type:"hero-death-signal" as const,
    id:"death-signal",day:1,adventurerId:hero.id,message:"Gone"};
  const tape={version:1 as const,day:1,heroId:hero.id,
    floor:1 as const,
    appearance:{role:hero.role,equipment:hero.equipment},
    steps:[{x:1,z:1,t:0,action:"enter" as const,hp:1},
      {x:2,z:1,t:1,action:"trap" as const,hp:0},
      {x:2,z:1,t:2,action:"death" as const,hp:0}],
    encounters:[],outcome:"death" as const};
  const recording={id:"real-trap-tape",day:1,
    type:"dungeon-live" as const,adventurerId:hero.id,
    dungeonReplay:tape,message:"Recorded trap step"};
  const saved={...state,events:[...state.events,signal,recording]};
  assert.deepEqual(findCommittedDeathFootage(saved,hero.id,signal.id),
    {kind:"expedition-recording",eventId:recording.id});
});

test("active lethal combat takes priority over unrelated tapes",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  const signal={type:"hero-death-signal" as const,
    id:"death-signal",day:1,adventurerId:hero.id,message:"Gone"};
  const active={id:"battle:f1:hero",heroIds:[hero.id],
    state:{actors:[{id:hero.id,hp:0}]}} as
      GameState["liveDungeon"]["combats"][number];
  const saved={...state,events:[...state.events,signal],
    liveDungeon:{...state.liveDungeon,combats:[active]}};
  assert.deepEqual(findCommittedDeathFootage(saved,hero.id,signal.id),
    {kind:"active-combat",fightId:active.id});
});
