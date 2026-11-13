import test from "node:test";
import assert from "node:assert/strict";
import {
  createLevel5Room, excavateLevel5Cell, isLevel5Air,
  isProtectedRoomCell, isValidLevel5Room,
} from "../../src/game/level5Room.ts";

test("new shop is unchanged and mining needs an expansion unlock",()=>{
  const room=createLevel5Room();
  assert.equal(isValidLevel5Room(room),true);
  assert.equal(isLevel5Air(room,{x:0,z:0}),true);
  assert.equal(isLevel5Air(room,{x:8,z:0}),false);
  assert.equal(excavateLevel5Cell(room,{x:8,z:0}).ok,false);
});

test("excavation is immutable, adjacent and reproducible",()=>{
  const original={...createLevel5Room(),expansionTier:1};
  const first=excavateLevel5Cell(original,{x:8,z:0});
  assert.equal(first.ok,true);
  if(!first.ok)return;
  assert.equal(original.excavatedCells.length,0);
  assert.equal(isLevel5Air(first.room,{x:8,z:0}),true);
  assert.equal(isValidLevel5Room(first.room),true);
  assert.equal(excavateLevel5Cell(original,{x:9,z:0}).ok,false);
  const second=excavateLevel5Cell(first.room,{x:9,z:0});
  assert.equal(second.ok,true);
  if(second.ok)assert.deepEqual(second.room.excavatedCells,["8,0","9,0"]);
  assert.equal(excavateLevel5Cell(first.room,{x:8,z:0}).ok,false);
});

test("entrances, expansion bounds and malformed saves are rejected",()=>{
  const room={...createLevel5Room(),expansionTier:1};
  assert.equal(isProtectedRoomCell({x:4,z:8}),true);
  assert.equal(excavateLevel5Cell(room,{x:4,z:8}).ok,false);
  assert.equal(excavateLevel5Cell(room,{x:10,z:0}).ok,false);
  assert.equal(isValidLevel5Room({...room,excavatedCells:["9,9"]}),false);
  assert.equal(isValidLevel5Room({...room,excavatedCells:["8,0","8,0"]}),false);
  assert.equal(isValidLevel5Room({...room,excavatedCells:["8,0","9,0"]}),true);
  assert.equal(isValidLevel5Room({...room,excavatedCells:["8,0","9,2"]}),false);
});
