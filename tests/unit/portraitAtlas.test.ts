import test from "node:test";
import assert from "node:assert/strict";
import {portraitSourceRect,portraitCssFrame} from "../../src/game/portraitAtlas.ts";
test("every portrait stays strictly within its own source tile",()=>{
  for(let index=0;index<25;index++){
    const {sx,sy,sw,sh}=portraitSourceRect({naturalWidth:1000,naturalHeight:1000},index);
    const col=index%5,row=Math.floor(index/5);
    assert(sx>col*200&&sx+sw<(col+1)*200);
    assert(sy>row*200&&sy+sh<(row+1)*200);
    assert(sw>150&&sh>150);
    assert.match(portraitCssFrame(index).backgroundSize,/^595/);
  }
});
test("portrait crop is consistent across indices and wraps after 25",()=>{
  assert.deepEqual(portraitSourceRect({naturalWidth:500,naturalHeight:500},25),
    portraitSourceRect({naturalWidth:500,naturalHeight:500},0));
  assert.deepEqual(portraitCssFrame(24),portraitCssFrame(-1));
});
