import assert from "node:assert/strict";
import test from "node:test";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {WORLD_TICKS_PER_DAY,advanceWorldUntil,beginNextWorldDay,
  createWorldClock,lastWorldTickOfDay,scheduleWorldEvent,
  type ScheduledWorldEvent} from "../../src/game/worldClock.ts";
import {WorldClockPacer,REAL_MS_PER_WORLD_TICK} from "../../src/game/worldClockPacer.ts";

test("ordered simultaneous events have stable priority and sequence",()=>{
  let clock=createWorldClock();
  clock=scheduleWorldEvent(clock,"report",3,"feed");
  clock=scheduleWorldEvent(clock,"expedition",3,"hero-a");
  clock=scheduleWorldEvent(clock,"visitor",3,"guest");
  clock=scheduleWorldEvent(clock,"expedition",3,"hero-b");
  clock=scheduleWorldEvent(clock,"shop-command",3,"sale");
  clock=scheduleWorldEvent(clock,"regeneration",3,"site");
  const seen:string[]=[];
  const next=advanceWorldUntil({...createGameState(),worldClock:clock},3,(state,event)=>{
    seen.push(event.lane+":"+event.subjectId);return state;
  });
  assert.deepEqual(seen,["shop-command:sale","visitor:guest",
    "expedition:hero-a","expedition:hero-b","regeneration:site","report:feed"]);
  assert.equal(next.worldClock.tick,3);
  assert.equal(next.worldClock.nextSequence,7);
  assert.deepEqual(next.worldClock.pending,[]);
});

test("handler can schedule later events without repeating the event just committed",()=>{
  const clock=scheduleWorldEvent(createWorldClock(),"expedition",2,"hero");
  let count=0;
  const next=advanceWorldUntil({...createGameState(),worldClock:clock},4,(state,event)=>{
    count++;
    return event.lane==="expedition"
      ? {...state,worldClock:scheduleWorldEvent(state.worldClock,"report",4,"hero")}
      : state;
  });
  assert.equal(count,2);
  assert.equal(next.worldClock.pending.length,0);
  assert.equal(next.worldClock.tick,4);
});

test("sleep alone closes a day; pending daytime events cannot be silently skipped",()=>{
  const state=createGameState();
  assert.throws(()=>scheduleWorldEvent(state.worldClock,"visitor",0,"a"),/future/);
  assert.throws(()=>advanceWorldUntil(state,WORLD_TICKS_PER_DAY,x=>x),/bed/);
  const end=advanceWorldUntil(state,lastWorldTickOfDay(1),x=>x);
  assert.equal(end.day,1);
  const next=advanceDay(end).state;
  assert.equal(next.day,2);
  assert.equal(next.worldClock.tick,WORLD_TICKS_PER_DAY);
  assert.throws(()=>beginNextWorldDay(
    scheduleWorldEvent(createWorldClock(),"visitor",3,"a"),1),/unprocessed/);
});

test("new-version save round-trips scheduled event identity and resumes deterministically",()=>{
  let clock=createWorldClock();
  clock=scheduleWorldEvent(clock,"report",3,"guest");
  // A real expedition lane is now owned exclusively by liveDungeon.
  // This generic serialization fixture deliberately uses a passive lane.
  clock=scheduleWorldEvent(clock,"regeneration",5,"site");
  const before={...createGameState(23),worldClock:clock};
  const restored=parseSave(JSON.stringify(createSave(before)));
  const apply=(state:typeof before,event:ScheduledWorldEvent)=>({
    ...state,events:[...state.events,{
      id:"day-1:clock-"+event.sequence,type:"welcome" as const,
      day:1,message:event.subjectId,
    }],
  });
  assert.deepEqual(advanceWorldUntil(before,7,apply),
    advanceWorldUntil(restored,7,apply));
});

test("strict saves reject missing, mismatched and unsorted clock state",()=>{
  const raw=createSave(createGameState()) as any;
  const bad=(change:(x:any)=>void,pattern:RegExp)=>{
    const value=structuredClone(raw);change(value);
    assert.throws(()=>parseSave(JSON.stringify(value)),pattern);
  };
  bad(x=>{delete x.payload.worldClock;},/worldClock.*required/);
  bad(x=>{x.payload.worldClock.tick=WORLD_TICKS_PER_DAY;},/worldClock.tick/);
  bad(x=>{x.payload.worldClock.nextSequence=0;},/nextSequence/);
  bad(x=>{x.payload.worldClock.nextSequence=2;
    x.payload.worldClock.pending=[{id:"clock-1",dueTick:1,lane:"bad",
      subjectId:"hero",sequence:1}];},/lane/);
  bad(x=>{x.payload.worldClock.nextSequence=2;
    x.payload.worldClock.pending=[{id:"clock-1",dueTick:0,lane:"visitor",
      subjectId:"hero",sequence:1}];},/dueTick/);
});

test("FPS-independent ticks; pause excludes tab time and manual interruptions",()=>{
  const simulate=(frames:readonly number[])=>{
    const store=new GameStore(createGameState(13)),pacer=new WorldClockPacer();
    for(const ms of frames)pacer.step(ms,false,ticks=>store.advanceWorldTime(ticks));
    return store.state;
  };
  assert.deepEqual(simulate(Array(20).fill(150)),simulate(Array(10).fill(300)));
  const store=new GameStore(),pacer=new WorldClockPacer();
  pacer.step(REAL_MS_PER_WORLD_TICK*1.5,false,ticks=>store.advanceWorldTime(ticks));
  pacer.step(5000,true,ticks=>store.advanceWorldTime(ticks));
  pacer.step(REAL_MS_PER_WORLD_TICK,false,ticks=>store.advanceWorldTime(ticks));
  assert.equal(store.state.worldClock.tick,2);
  pacer.setPaused("manual",true);
  pacer.step(2000,false,ticks=>store.advanceWorldTime(ticks));
  assert.equal(store.state.worldClock.tick,2);
  pacer.setPaused("manual",false);
  pacer.step(REAL_MS_PER_WORLD_TICK,false,ticks=>store.advanceWorldTime(ticks));
  assert.equal(store.state.worldClock.tick,3);
});
