import assert from "node:assert/strict";
import test from "node:test";
import {createGroupCombat,stepGroupCombat,resolveGroupCombat,type GroupCombatOptions} from "../../src/game/groupCombat.ts";
import {appendCombatFrame,combatFrameTimelineValid,MAX_COMBAT_FRAMES} from "../../src/game/combatRecording.ts";

const bounds={minX:-15,maxX:15,minZ:-15,maxZ:15};
function slowEncounter():GroupCombatOptions{
  return {bounds,actors:[
    {id:"hero",team:"heroes",role:"healer",style:"ranged",x:0,z:0,
      hp:200,maxHp:200,damage:1,armor:0,speed:0,reach:1.6},
    {id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:6,
      hp:140,maxHp:140,damage:1,armor:0,speed:0,reach:1.6},
  ]};
}
test("a productive fight continues beyond both historical cutoffs",()=>{
  const s=createGroupCombat(slowEncounter());
  for(let tick=0;tick<120*60;tick++)stepGroupCombat(s);
  assert.equal(s.outcome,"fighting");
  assert(s.actors.find(a=>a.id==="enemy")!.hp<140);
  assert(s.progress&&s.progress.lastAt>90);
  assert(!s.retreat);
  const result=resolveGroupCombat(slowEncounter());
  assert.equal(result.state.outcome,"heroes");
  assert(result.state.time>120);
  assert.equal(result.replay.frames[0].t,0);
  assert(result.replay.frames.length<=MAX_COMBAT_FRAMES);
  assert(Math.abs(result.replay.frames.at(-1)!.t-result.state.time)<.001);
});
test("a real impasse attempts retreat before admitting a stalemate",()=>{
  const s=createGroupCombat({bounds,actors:[
    {id:"hero",team:"heroes",role:"DPS",style:"melee",x:-5,z:0,
      hp:100,maxHp:100,damage:1,armor:0,speed:0,reach:1.6},
    {id:"enemy",team:"monsters",role:"monster",style:"melee",x:5,z:0,
      hp:100,maxHp:100,damage:1,armor:0,speed:0,reach:1.6},
  ]});
  for(let i=0;i<31*60;i++)stepGroupCombat(s);
  assert.equal(s.outcome,"fighting");
  assert(s.retreat);
  assert(s.events.some(e=>e.kind==="retreat-start"));
  const copy=JSON.parse(JSON.stringify(s));
  for(let i=0;i<31*60;i++){stepGroupCombat(s);stepGroupCombat(copy);}
  assert.deepEqual(s,copy);
  assert.equal(s.outcome,"draw");
  assert(s.events.some(e=>e.kind==="stalemate"));
  assert(s.actors.every(a=>a.hp===100));
});
test("long footage retains its beginning and full recent 10Hz timeline",()=>{
  const frames:Parameters<typeof appendCombatFrame>[0]=[];
  for(let i=0;i<=10000;i++)
    appendCombatFrame(frames,{t:i/10,actors:[],projectiles:[]});
  assert(frames.length<=MAX_COMBAT_FRAMES);
  assert.equal(frames[0].t,0);
  assert.equal(frames.at(-1)!.t,1000);
  assert(combatFrameTimelineValid(frames,60000));
  assert(!combatFrameTimelineValid(frames.slice(0,-1),60000));
  assert(!combatFrameTimelineValid([{t:0},{t:1000}],60000));
});
