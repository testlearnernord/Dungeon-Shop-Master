import assert from "node:assert/strict";
import test from "node:test";
import { createBlueprintPreviewValidator } from "../../src/game/blueprintPreviewValidator.ts";
import { createShopLayout } from "../../src/game/shopLayout.ts";
import type { FurnitureDraft } from "../../src/game/furnitureBlueprint.ts";

const counter=(x:number):FurnitureDraft=>({id:"counter",x,z:0,rotation:0});

test("moving the snapped blueprint across valid cells never recalculates a route every frame",()=>{
  const layout=createShopLayout();
  let calls=0;
  const preview=createBlueprintPreviewValidator(()=>{calls++;return null;},140);
  for(let i=0;i<100;i++){
    // One new quarter-metre cell every 60 ms, sampled at 60fps.
    const at=i*16;
    assert.equal(preview.evaluate(counter(Math.floor(at/60)*.25),layout,
      undefined,at).ready,false);
  }
  assert.equal(calls,0,"continuous mouse look must not run any full path search");
  const rested=preview.evaluate(counter(Math.floor(99*16/60)*.25),layout,
    undefined,99*16+141);
  assert.deepEqual(rested,{ready:true,problem:null});
  assert.equal(calls,1);
  for(let frame=0;frame<200;frame++)
    assert(preview.evaluate(counter(Math.floor(99*16/60)*.25),layout,
      undefined,1800+frame*16).ready);
  assert.equal(calls,1,"stable hover must reuse the cached path check");
});

test("immediate placement validates even before the quiet period and caches valid and invalid drafts",()=>{
  const layout=createShopLayout();
  let calls=0;
  const preview=createBlueprintPreviewValidator(draft=>{
    calls++;
    return draft.x===1?"Customer cannot reach checkout.":null;
  });
  assert.equal(preview.evaluate(counter(1),layout,undefined,0).ready,false);
  assert.deepEqual(preview.evaluate(counter(1),layout,undefined,1,true),
    {ready:true,problem:"Customer cannot reach checkout."});
  assert.deepEqual(preview.evaluate(counter(1),layout,undefined,200),
    {ready:true,problem:"Customer cannot reach checkout."});
  assert.deepEqual(preview.evaluate(counter(0),layout,undefined,201,true),
    {ready:true,problem:null});
  assert.equal(calls,2,"both valid and invalid checks are memoized");
});

test("moving furniture or excavating the room invalidates old path checks",()=>{
  const layout=createShopLayout();
  const changed={...layout,shelves:layout.shelves.map(shelf=>shelf)};
  let calls=0;
  const preview=createBlueprintPreviewValidator(()=>{calls++;return null;});
  preview.evaluate(counter(0),layout,undefined,0,true);
  preview.evaluate(counter(0),layout,undefined,1,true);
  preview.evaluate(counter(0),changed,undefined,2,true);
  assert.equal(calls,2,"new layout must not use previous geometry");
  const room={...({expansionTier:0,excavated:[]} as any)};
  preview.evaluate(counter(0),changed,room,3,true);
  assert.equal(calls,3,"excavation topology must invalidate cached reachability");
});
