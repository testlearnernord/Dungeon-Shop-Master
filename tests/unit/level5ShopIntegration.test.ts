import test from "node:test";
import assert from "node:assert/strict";
import { createLevel5Room, excavateLevel5Cell, isValidLevel5Room } from "../../src/game/level5Room.ts";
import { createShopLayout, shopLayoutProblem, type ShopLayout } from "../../src/game/shopLayout.ts";
import { idleShopPositions } from "../../src/game/npcTraffic.ts";

test("mining cannot persist invisible front/back rooms",()=>{
  const base={...createLevel5Room(),expansionTier:1};
  assert.equal(excavateLevel5Cell(base,{x:0,z:8}).ok,false);
  assert.equal(excavateLevel5Cell(base,{x:8,z:7}).ok,false);
  assert.equal(isValidLevel5Room({...base,excavatedCells:["0,8"]}),false);
  const mined=excavateLevel5Cell(base,{x:8,z:0});
  assert.equal(mined.ok,true);
  if(mined.ok)assert.equal(isValidLevel5Room(mined.room),true);
});

test("furniture cannot float across rock while new floor is usable",()=>{
  const room={...createLevel5Room(),expansionTier:2,
    excavatedCells:Array.from({length:7},(_,i)=>`8,${i-3}`)};
  assert.equal(isValidLevel5Room(room),true);
  const layout=createShopLayout();
  const moved:ShopLayout={...layout,shelves:layout.shelves.map(s=>
    s.id==="shelf-1"?{...s,x:8,z:0,rotation:0 as const}:s)};
  assert.match(shopLayoutProblem(moved,room)??"",/wall/);
  assert.equal(shopLayoutProblem(layout,room),null);
});

test("idle destinations stay inside the currently walkable shop",()=>{
  const layout=createShopLayout();
  const room={...createLevel5Room(),expansionTier:1,excavatedCells:["8,0","9,0"]};
  const points=idleShopPositions(layout,20,room);
  assert.ok(points.length>0);
  assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});
