import assert from "node:assert/strict";
import test from "node:test";
import {minimapPointFromClient,isKnownMinimapCell}
  from "../../src/game/dungeonMinimapNavigation.ts";

const rect={left:40,top:60,width:372,height:279};

test("minimap navigation honors displayed CSS dimensions, not backing pixels",()=>{
  assert.deepEqual(minimapPointFromClient(40,60,rect,31,31),{x:0,z:30});
  assert.deepEqual(minimapPointFromClient(40+372*15.5/31,
    60+279*9.5/31,rect,31,31),{x:15,z:21});
  assert.deepEqual(minimapPointFromClient(411.999,338.999,rect,31,31),
    {x:30,z:0});
  assert.equal(minimapPointFromClient(412,338,rect,31,31),null);
  assert.equal(minimapPointFromClient(39,70,rect,31,31),null);
  assert.equal(minimapPointFromClient(41,59,rect,31,31),null);
  assert.equal(minimapPointFromClient(NaN,65,rect,31,31),null);
  assert.equal(minimapPointFromClient(45,65,{...rect,width:0},31,31),null);
});

test("personal fog rejects even a correct click in an unknown square",()=>{
  const explored=new Set([0,1,31,32]);
  assert.deepEqual(minimapPointFromClient(40,60+279*30.5/31,rect,31,31,explored),
    {x:0,z:0});
  assert.equal(minimapPointFromClient(40+372*12/31,
    60+279*12/31,rect,31,31,explored),null);
  assert.equal(isKnownMinimapCell({x:12,z:12},31,31,explored),false);
  assert.equal(isKnownMinimapCell({x:12,z:12},31,31),true,
    "The explicit full-floor spectator has the whole map");
  assert.equal(isKnownMinimapCell({x:-1,z:5},31,31),false);
  assert.equal(isKnownMinimapCell({x:31,z:5},31,31),false);
  assert.equal(isKnownMinimapCell({x:0.2,z:5},31,31),false);
  assert.deepEqual([...explored],[0,1,31,32],
    "Map navigation never changes visited tiles");
});
