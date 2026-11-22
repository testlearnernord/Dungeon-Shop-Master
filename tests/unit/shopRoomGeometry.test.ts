import test from "node:test";
import assert from "node:assert/strict";
import {
  createShopRoomGeometry, excavateShopRoomCell, isShopRoomAir,
  isProtectedRoomCell, isValidShopRoomGeometry,
} from "../../src/game/shopRoomGeometry.ts";

test("new shop is unchanged and mining needs an expansion unlock",()=>{
  const room=createShopRoomGeometry();
  assert.equal(isValidShopRoomGeometry(room),true);
  assert.equal(isShopRoomAir(room,{x:0,z:0}),true);
  assert.equal(isShopRoomAir(room,{x:8,z:0}),false);
  assert.equal(excavateShopRoomCell(room,{x:8,z:0}).ok,false);
});

test("excavation is immutable, adjacent and reproducible",()=>{
  const original={...createShopRoomGeometry(),expansionTier:1};
  const first=excavateShopRoomCell(original,{x:8,z:0});
  assert.equal(first.ok,true);
  if(!first.ok)return;
  assert.equal(original.excavatedCells.length,0);
  assert.equal(isShopRoomAir(first.room,{x:8,z:0}),true);
  assert.equal(isValidShopRoomGeometry(first.room),true);
  assert.equal(excavateShopRoomCell(original,{x:9,z:0}).ok,false);
  const second=excavateShopRoomCell(first.room,{x:9,z:0});
  assert.equal(second.ok,true);
  if(second.ok)assert.deepEqual(second.room.excavatedCells,["8,0","9,0"]);
  assert.equal(excavateShopRoomCell(first.room,{x:8,z:0}).ok,false);
});

test("entrances, expansion bounds and malformed saves are rejected",()=>{
  const room={...createShopRoomGeometry(),expansionTier:1};
  assert.equal(isProtectedRoomCell({x:4,z:8}),true);
  assert.equal(excavateShopRoomCell(room,{x:4,z:8}).ok,false);
  assert.equal(excavateShopRoomCell(room,{x:10,z:0}).ok,false);
  assert.equal(isValidShopRoomGeometry({...room,excavatedCells:["9,9"]}),false);
  assert.equal(isValidShopRoomGeometry({...room,excavatedCells:["8,0","8,0"]}),false);
  assert.equal(isValidShopRoomGeometry({...room,excavatedCells:["8,0","9,0"]}),true);
  assert.equal(isValidShopRoomGeometry({...room,excavatedCells:["8,0","9,2"]}),false);
});
