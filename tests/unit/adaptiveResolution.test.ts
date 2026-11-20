import test from "node:test";
import assert from "node:assert/strict";
import {AdaptiveResolutionPolicy,RENDER_SCALES}
  from "../../src/game/adaptiveResolution.ts";

function runForMs(policy:AdaptiveResolutionPolicy,
  milliseconds:number,gap:number,renderCpuMs=1,
  start=0):{changes:number[];end:number}{
  const changes:number[]=[];
  let now=start;
  const end=start+milliseconds;
  while(now<end){
    now+=gap;
    const selected=policy.observe({
      now,gapMs:gap,worldCpuMs:.5,renderCpuMs,active:true,
    });
    if(selected!==null)changes.push(selected);
  }
  return {changes,end:now};
}
test("a stable 60fps render stays at full quality without interference",()=>{
  const p=new AdaptiveResolutionPolicy();
  assert.equal(p.mode,"native");
  const {changes}=runForMs(p,30000,1000/60);
  assert.deepEqual(changes,[]);
  assert.equal(p.scale,1);
});
test("persistent GPU-like 20fps lowers Babylon resolution in bounded steps",()=>{
  const p=new AdaptiveResolutionPolicy();
  p.setMode("auto");
  const {changes,end}=runForMs(p,18000,50);
  assert(changes.length>=2);
  assert.equal(changes[0],1.25);
  for(let i=1;i<changes.length;i++)assert(changes[i]>=changes[i-1]);
  assert(changes.every(value=>RENDER_SCALES.includes(
    value as typeof RENDER_SCALES[number])));
  assert(p.scale<=2&&p.scale>1);
  // Recovery is deliberate and slow: no rapid quality oscillations.
  const recovered=runForMs(p,25000,1000/60,1,end);
  assert(recovered.changes.length>=1);
  assert(recovered.changes[0]<changes.at(-1)!);
});
test("a slow JavaScript simulation is NOT misdiagnosed as GPU fill rate",()=>{
  const p=new AdaptiveResolutionPolicy();
  p.setMode("auto");
  const outcome=runForMs(p,30000,50,22);
  assert.deepEqual(outcome.changes,[]);
  assert.equal(p.scale,1);
});
test("manual F4 begins at native; auto is explicitly opt-in",()=>{
  const p=new AdaptiveResolutionPolicy();
  assert.equal(p.mode,"native");
  assert.equal(p.scale,1);
  assert.equal(p.cycle(),1.5);
  assert.equal(p.mode,"balanced");
  assert.equal(p.cycle(),2);
  assert.equal(p.mode,"performance");
  assert.equal(p.cycle(),1);
  assert.equal(p.mode,"auto");
  assert.equal(p.cycle(),1);
  assert.equal(p.mode,"native");
  assert.equal(p.setMode("performance"),2);
  assert.equal(p.setMode("native"),1);
  assert.throws(()=>p.setMode("worse" as never),/Unknown render quality/);
});
test("inactive/hidden frames, long OS stalls and invalid timestamps do not lower resolution",()=>{
  const p=new AdaptiveResolutionPolicy();
  p.setMode("auto");
  let now=0;
  for(let i=0;i<1000;i++){
    now+=50;
    const selected=p.observe({
      now,gapMs:i%10===0?250:50,worldCpuMs:.5,
      renderCpuMs:1,active:false,
    });
    assert.equal(selected,null);
  }
  assert.equal(p.scale,1);
});
