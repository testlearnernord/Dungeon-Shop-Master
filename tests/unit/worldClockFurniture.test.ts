import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {WORLD_TICKS_PER_DAY,firstWorldTickOfDay,lastWorldTickOfDay}
  from "../../src/game/worldClock.ts";
import {worldClockFace} from "../../src/game/worldClockFace.ts";
import {DEFAULT_WALL_CLOCK,wallClockProblem} from "../../src/game/wallClockPlacement.ts";
import {blueprintAtSurface} from "../../src/game/furnitureBlueprint.ts";

test("a single authoritative world tick drives exactly one 24-hour pointer rotation",()=>{
  const first=worldClockFace(1,0);
  assert.deepEqual([first.hour,first.minute,first.angleRadians,first.stopped],
    [0,0,0,false]);
  const six=worldClockFace(1,WORLD_TICKS_PER_DAY/4);
  assert.deepEqual([six.hour,six.minute,six.angleRadians,six.stopped],
    [6,0,-Math.PI/2,false]);
  const twelve=worldClockFace(1,WORLD_TICKS_PER_DAY/2);
  assert.equal(twelve.label,"12:00");
  assert.equal(twelve.angleRadians,-Math.PI);
  assert.equal(worldClockFace(1,3*WORLD_TICKS_PER_DAY/4).label,"18:00");
  const stopped=worldClockFace(1,lastWorldTickOfDay(1));
  assert.equal(stopped.stopped,true);
  assert.equal(stopped.label,"24:00");
  assert.equal(stopped.angleRadians,-2*Math.PI);
  assert.equal(worldClockFace(2,firstWorldTickOfDay(2)).label,"00:00");
  assert.throws(()=>worldClockFace(1,firstWorldTickOfDay(2)),/in-day/);
  assert.equal(worldClockFace(1,WORLD_TICKS_PER_DAY/2),
    worldClockFace(1,WORLD_TICKS_PER_DAY/2),"pure function returns a deterministic value"
  );
});

test("the default clock is pre-mounted on a real clear wall and moves via P",()=>{
  const initial=createGameState();
  const store=new GameStore(initial);
  assert.deepEqual(initial.wallClock,DEFAULT_WALL_CLOCK);
  assert.equal(wallClockProblem(initial.wallClock,initial.shopLayout,
    initial.shopRoom,initial.rosterBoard),null);
  const placement=blueprintAtSurface("world-clock","left-wall",
    {x:-7.5,z:2.24},0,initial.shopRoom);
  assert.deepEqual(placement,{id:"world-clock",x:-7.22,z:2.25,rotation:3});
  assert.equal(store.previewFurniturePlacement(placement!),null);
  assert.equal(store.placeFurniture(placement!),"World clock mounted.");
  assert.deepEqual(store.state.wallClock,{x:-7.22,z:2.25,rotation:3});
  assert.equal(store.state.worldClock.tick,initial.worldClock.tick);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))).wallClock,
    store.state.wallClock);
  const before=store.state;
  const overlap=blueprintAtSurface("world-clock","front-wall",
    {x:-5.5,z:-7},0,initial.shopRoom)!;
  assert.match(store.placeFurniture(overlap),/Adventurer Board/);
  assert.strictEqual(store.state,before);
  assert.equal(blueprintAtSurface("world-clock","floor",
    {x:0,z:0},0),null,"wall clock cannot become a floor object");
});

test("strict save rejects a fictional clock attachment or missing wall clock",()=>{
  const initial=createGameState();
  const save=JSON.parse(JSON.stringify(createSave(initial)));
  delete save.payload.wallClock;
  assert.throws(()=>parseSave(JSON.stringify(save)),/wallClock/);
  const invalid=JSON.parse(JSON.stringify(createSave(initial)));
  invalid.payload.wallClock={x:0,z:0,rotation:0};
  assert.throws(()=>parseSave(JSON.stringify(invalid)),/wallClock/);
});
