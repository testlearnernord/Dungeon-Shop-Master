import assert from "node:assert/strict";
import test from "node:test";
import {
  committedLivePartyStep, sampleLivePartyStep, livePartyVisualOffset,
  LIVE_PARTY_STEP_SECONDS, type LivePartyCheckpoint,
} from "../../src/game/livePartyPresentation.ts";

const checkpoint=(x:number,z:number,tick:number,overrides:
  Partial<LivePartyCheckpoint>={}):LivePartyCheckpoint=>({
  heroId:"h1",floor:1,worldTick:tick,x,z,combat:null,
  heroes:[{id:"h1"},{id:"h2"},{id:"h3"}],...overrides,
});

test("only two genuine adjacent committed party checkpoints animate",()=>{
  const from=checkpoint(3,5,600),to=checkpoint(4,5,1200);
  const unchanged=structuredClone(from);
  const step=committedLivePartyStep(from,to);
  assert.deepEqual(step,{
    fromX:3,fromZ:5,toX:4,toZ:5,heading:Math.PI/2,
  });
  assert.deepEqual(from,unchanged,"Presentation never mutates world checkpoints");
  assert.equal(committedLivePartyStep(from,checkpoint(3,5,1200)),null);
  assert.equal(committedLivePartyStep(from,checkpoint(5,5,1200)),null);
  assert.equal(committedLivePartyStep(from,checkpoint(4,6,1200)),null);
  assert.equal(committedLivePartyStep(from,checkpoint(4,5,600)),null);
  assert.equal(committedLivePartyStep(null,to),null);
});

test("combat, floor changes and changed party membership never create fake travel",()=>{
  const from=checkpoint(3,5,600),to=checkpoint(4,5,1200);
  assert.equal(committedLivePartyStep(from,{...to,combat:{id:"fight"}}),null);
  assert.equal(committedLivePartyStep({...from,combat:{id:"fight"}},to),null);
  assert.equal(committedLivePartyStep(from,{...to,floor:2}),null);
  assert.equal(committedLivePartyStep(from,{...to,heroId:"h2"}),null);
  assert.equal(committedLivePartyStep(from,{...to,heroes:[{id:"h1"},{id:"h3"}]}),null);
  assert.deepEqual(committedLivePartyStep(
    {...from,heroes:[...from.heroes].reverse()},to),
    committedLivePartyStep(from,to),"Member order is not gameplay movement");
});

test("render-frame samples preserve exact endpoints and stop the walk",()=>{
  const to=checkpoint(4,5,1200);
  const step=committedLivePartyStep(checkpoint(3,5,600),to)!;
  assert.deepEqual(sampleLivePartyStep(step,0,to),{x:3,z:5,walking:true});
  assert.deepEqual(sampleLivePartyStep(step,LIVE_PARTY_STEP_SECONDS/2,to),
    {x:3.5,z:5,walking:true});
  assert.deepEqual(sampleLivePartyStep(step,LIVE_PARTY_STEP_SECONDS,to),
    {x:4,z:5,walking:false});
  assert.deepEqual(sampleLivePartyStep(step,100,to),
    {x:4,z:5,walking:false});
  assert.deepEqual(sampleLivePartyStep(null,0,to),
    {x:4,z:5,walking:false});
});

test("all LIVE companions have stable nonoverlapping cosmetic formation",()=>{
  const members=["h3","h1","h2"];
  const offsets=members.map(id=>livePartyVisualOffset(members,id,Math.PI/2));
  assert.equal(new Set(offsets.map(p=>p.z.toFixed(3))).size,3);
  assert(offsets.every(p=>Math.hypot(p.x,p.z)<0.75));
  assert.deepEqual(livePartyVisualOffset([...members].reverse(),"h1",Math.PI/2),
    livePartyVisualOffset(members,"h1",Math.PI/2));
});
