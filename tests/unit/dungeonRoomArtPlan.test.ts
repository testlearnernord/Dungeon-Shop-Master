import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout,generateDungeonLayout,dungeonDownStair,dungeonRoomCells,tileAt} from "../../src/game/dungeonLayout.ts";
import {dungeonRoomArtPlan,dungeonPassageArtPlan,dungeonRoomTileThemes,ROOM_SURFACE_TINTS,ROOM_THEME_NAMES} from "../../src/game/dungeonRoomArtPlan.ts";

test("the shared room art is deterministic, varied and never alters the canonical layout",()=>{
  for(const seed of [0,42,7351,9321,2026])for(const floor of [1,4,5,9] as const){
    const map=generateExpeditionLayout(seed,floor),before=structuredClone(map);
    const plan=dungeonRoomArtPlan(map);
    assert.deepEqual(plan,dungeonRoomArtPlan(generateExpeditionLayout(seed,floor)));
    assert.deepEqual(map,before);
    assert.equal(plan.length,map.rooms.length);
    const themes=dungeonRoomTileThemes(map,plan);
    assert.equal(themes.size,map.tiles.filter(t=>t==="room").length);
    for(const [index,theme] of themes){assert.equal(map.tiles[index],"room");assert(ROOM_SURFACE_TINTS[theme]);}
    const workshop=plan.filter(p=>p.theme==="workshop");
    assert(workshop.length<=1);
    assert.equal(new Set(plan.map(p=>p.theme)).size,4+workshop.length);
    if(floor<5)assert.equal(workshop.length,0);
    assert.equal(plan.filter(p=>p.theme==="hall").length,1);
    assert.equal(plan.filter(p=>p.theme==="vault").length,1);
    assert.equal(dungeonRoomCells(map,plan.find(p=>p.theme==="hall")!.room).length,
      Math.max(...map.rooms.map(r=>dungeonRoomCells(map,r).length)));
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
      assert.equal(tileAt(map,p.cell.x+(p.corner===0||p.corner===3?-1:1),p.cell.z),"wall");
      assert.equal(tileAt(map,p.cell.x,p.cell.z+(p.corner<2?-1:1)),"wall");
      assert(Math.abs(p.x)+.58<=room.width*1.25);
      assert(Math.abs(p.z)+.58<=room.height*1.25);
      assert(Math.abs(p.x-(p.cell.x-room.x)*2.5)>.58);
      assert(Math.abs(p.z-(p.cell.z-room.z)*2.5)>.58);
    }
  }
});

test("wall details and passage landmarks are bounded, deterministic and exclude real sites",()=>{
  for(const seed of [0,42,7351,9321,2026])for(const floor of [1,5,9]){
    const map=generateExpeditionLayout(seed,floor);
    const reserved=[map.entrance,dungeonDownStair(map),...map.features];
    const free=(p:{x:number;z:number})=>!reserved.some(f=>f.x===p.x&&f.z===p.z);
    const plan=dungeonPassageArtPlan(map);
    assert.deepEqual(plan,dungeonPassageArtPlan(generateExpeditionLayout(seed,floor)));
    assert(plan.length>0&&plan.length<=8);
    for(const p of plan){
      assert.equal(tileAt(map,p.cell.x,p.cell.z),"corridor");
      assert(free(p.cell));
      assert.equal(tileAt(map,p.cell.x+p.dx,p.cell.z+p.dz),"wall");
    }
    for(const room of dungeonRoomArtPlan(map)){
      assert(room.wallDetails.length<=2);
      for(const p of room.wallDetails){
        assert(free(p.cell));
        assert.equal(tileAt(map,p.cell.x,p.cell.z),"room");
        assert.equal(tileAt(map,p.cell.x+p.dx,p.cell.z+p.dz),"wall");
        assert(!room.anchors.some(a=>a.cell.x===p.cell.x&&a.cell.z===p.cell.z));
      }
      if(room.floorAccent){
        const p={x:room.room.x+room.floorAccent.x/2.5,z:room.room.z+room.floorAccent.z/2.5};
        assert(free(p));assert.equal(tileAt(map,p.x,p.z),"room");
      }
    }
  }
});
