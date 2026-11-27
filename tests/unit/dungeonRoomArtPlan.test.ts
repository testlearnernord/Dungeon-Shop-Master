import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,generateDungeonLayout,dungeonDownStair,tileAt} from "../../src/game/dungeonLayout.ts";
import {dungeonRoomArtPlan,ROOM_THEME_NAMES} from "../../src/game/dungeonRoomArtPlan.ts";

test("the shared room art is deterministic, varied and never alters the canonical layout",()=>{
  for(const seed of [0,42,7351,9321,2026])for(const floor of [1,4,5,9] as const){
    const map=generateExpeditionLayout(seed,floor),before=structuredClone(map);
    const plan=dungeonRoomArtPlan(map);
    assert.deepEqual(plan,dungeonRoomArtPlan(generateExpeditionLayout(seed,floor)));
    assert.deepEqual(map,before);
    assert.equal(plan.length,map.rooms.length);
    assert.equal(new Set(plan.map(p=>p.theme)).size,4);
    assert.equal(plan.filter(p=>p.theme==="hall").length,1);
    assert.equal(plan.filter(p=>p.theme==="vault").length,1);
    assert.equal(plan.find(p=>p.theme==="hall")!.room.width*
      plan.find(p=>p.theme==="hall")!.room.height,Math.max(...map.rooms.map(r=>r.width*r.height)));
    for(const p of plan)assert(ROOM_THEME_NAMES[p.theme]);
  }
});
test("corner props stay inside room boundaries away from features, stairs, doorways and cell centres",()=>{
  for(const seed of [0,42,7351,9321,2026])for(const [w,h] of [[15,15],[19,19],[31,31],[19,31],[31,19]]){
    const map=generateDungeonLayout(seed,3,w,h);
    const reserved=[map.entrance,dungeonDownStair(map),...map.features];
    const plan=dungeonRoomArtPlan(map);
    assert(plan.some(p=>p.anchors.length>0));
    for(const {room,anchors} of plan)for(const p of anchors){
      assert.equal(tileAt(map,p.cell.x,p.cell.z),"room");
      assert(!reserved.some(f=>f.x===p.cell.x&&f.z===p.cell.z));
      assert.equal(tileAt(map,p.cell.x+Math.sign(p.x),p.cell.z),"wall");
      assert.equal(tileAt(map,p.cell.x,p.cell.z+Math.sign(p.z)),"wall");
      assert(Math.abs(p.x)+.58<=room.width*1.25);
      assert(Math.abs(p.z)+.58<=room.height*1.25);
      assert(Math.abs(p.x-(p.cell.x-room.x)*2.5)>.58);
      assert(Math.abs(p.z-(p.cell.z-room.z)*2.5)>.58);
    }
  }
});
