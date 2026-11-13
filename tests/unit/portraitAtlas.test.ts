import test from "node:test";
import assert from "node:assert/strict";
import {heroPortraitRegion,heroPortraitBackground,PORTRAIT_GRID}
  from "../../src/game/portraitAtlas.ts";
test("every one of 25 portraits stays within its own atlas cell",()=>{
  for(let index=0;index<25;index++){
    const c=heroPortraitRegion(index,500,500);
    const col=index%5,row=Math.floor(index/5);
    assert(c.sx>=col*100&&c.sx+c.sw<=(col+1)*100);
    assert(c.sy>=row*100&&c.sy+c.sh<=(row+1)*100);
    assert(c.sw>80&&c.sh>80);
    assert.match(heroPortraitBackground(index).position,/^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/);
  }
  assert.equal(PORTRAIT_GRID,5);
});
test("CSS and Canvas atlas crops select the same image rectangle",()=>{
  for(let i=0;i<25;i++){
    const region=heroPortraitRegion(i,500,500);
    const css=heroPortraitBackground(i);
    const scale=parseFloat(css.size)/100;
    const px=css.position.split(" ").map(v=>parseFloat(v)/100);
    // CSS positions slide the scaled atlas across the target viewport.
    const sourceX=px[0]*(500-500/scale);
    const sourceY=px[1]*(500-500/scale);
    assert(Math.abs(sourceX-region.sx)<1e-7);
    assert(Math.abs(sourceY-region.sy)<1e-7);
  }
});
