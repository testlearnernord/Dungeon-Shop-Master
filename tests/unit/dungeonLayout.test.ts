import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDungeonLayout, generateExpeditionLayout, dungeonDownStair, dungeonNeighbors, dungeonSeed,
  dungeonShortestPath, dungeonRoomCells, dungeonRoomContains, tileAt,
} from "../../src/game/dungeonLayout.ts";

test("identical campaign seed/floor creates byte-identical room-first layout without changing RNG state", () => {
  const first=generateDungeonLayout(7351,7);
  const second=generateDungeonLayout(7351,7);
  assert.deepEqual(first,second);
  assert.equal(first.version,1);
  assert.equal(first.floor,7);
  assert.equal(first.width,31);
  assert.equal(first.height,31);
  assert.equal(first.tiles.length,31*31);
  assert.notDeepEqual(first,generateDungeonLayout(7352,7));
  assert.notDeepEqual(first,generateDungeonLayout(7351,8));
  assert.equal(first.seed,dungeonSeed(7351,7));
});

test("many map seeds have a fully connected room-first layout with meaningful routes", () => {
  for(const seed of [0,1,7,7351,0xffffffff,123456789,987654321,4501,1911,88,99,111]){
    const map=generateDungeonLayout(seed);
    const visited=new Set<string>();
    const queue=[map.entrance];
    for(let i=0;i<queue.length;i++){
      const point=queue[i];
      const key=point.x+":"+point.z;
      if(visited.has(key))continue;
      visited.add(key);
      for(const next of dungeonNeighbors(map,point)){
        if(!visited.has(next.x+":"+next.z))queue.push(next);
      }
    }
    const openTiles=map.tiles.filter(tile=>tile!=="wall").length;
    assert.equal(visited.size,openTiles,"All walkable tiles must connect to entrance: "+seed);
    assert(map.rooms.length>=3,"Expect meaningful dungeon chambers");
    assert(map.tiles.some(t=>t==="corridor"));
    assert(map.tiles.some(t=>t==="room"));
    const deadEnds=[...visited].filter(key=>{
      const [x,z]=key.split(":").map(Number);
      return dungeonNeighbors(map,{x,z}).length===1;
    });
    assert(deadEnds.length<=1,"Only the portal approach may be a dead end: "+seed);
    assert(map.features.length===16,"Expected traps, loot and monsters");
    assert(map.features.filter(f=>f.kind==="monster").length===8);
    assert(map.features.filter(f=>f.kind==="treasure").length===4);
    assert(map.features.filter(f=>f.kind==="trap").length===4);
    const features=new Set<string>();
    for(const feature of map.features){
      assert.equal(visited.has(feature.x+":"+feature.z),true);
      assert(!features.has(feature.x+":"+feature.z),"Feature overlap: "+seed);
      features.add(feature.x+":"+feature.z);
      assert(dungeonShortestPath(map,map.entrance,feature).length>1,
        "Every feature requires a valid real path: "+feature.id);
    }
    // No wall or off-map coordinate can become a path goal.
    assert.deepEqual(dungeonShortestPath(map,map.entrance,{x:0,z:0}),[]);
    assert.equal(tileAt(map,-1,5),"wall");
    assert.equal(tileAt(map,100,100),"wall");
    for(let x=0;x<map.width;x++){
      assert.equal(tileAt(map,x,0),"wall");
      assert.equal(tileAt(map,x,map.height-1),"wall");
    }
  }
});

test("generated dimensions, seeds and floor identifiers have strict bounds", () => {
  assert.throws(()=>generateDungeonLayout(1,7,30,31),/odd integers/);
  assert.throws(()=>generateDungeonLayout(1,7,13,31),/odd integers/);
  assert.throws(()=>generateDungeonLayout(1,7,31,62),/odd integers/);
  assert.throws(()=>generateDungeonLayout(-1),/Seed/);
  assert.throws(()=>generateDungeonLayout(1,0),/1–100/);
  assert.throws(()=>generateDungeonLayout(1,101),/1–100/);
  const tiny=generateDungeonLayout(1,7,15,15);
  assert.equal(tiny.width,15);
  assert(tiny.rooms.length>=1);
});

test("rectangular maps stay bounded, reserve both stairs and connect every room",()=>{
  for(const [width,height] of [[15,15],[15,61],[61,15],[19,31],[31,19],[31,31],[61,61]]){
    for(const seed of [0,42,7351,9321,0xffffffff]){
      const map=generateDungeonLayout(seed,3,width,height);
      const down=dungeonDownStair(map);
      assert.notDeepEqual(down,map.entrance);
      for(const f of map.features){
        assert.notDeepEqual({x:f.x,z:f.z},down);
        assert.notDeepEqual({x:f.x,z:f.z},map.entrance);
      }
      for(let z=0;z<height;z++)for(let x=0;x<width;x++){
        if(x===0||z===0||x===width-1||z===height-1)
          assert.equal(tileAt(map,x,z),"wall");
      }
      for(const room of map.rooms){
        assert(dungeonShortestPath(map,map.entrance,room).length>1);
        const cells=dungeonRoomCells(map,room);
        assert(cells.length>=9&&cells.length<=room.width*room.height);
        assert(dungeonRoomContains(map,room,room));
        const keys=new Set(cells.map(p=>p.x+":"+p.z));
        const queue=[room],seen=new Set([room.x+":"+room.z]);
        for(let i=0;i<queue.length;i++)for(const p of dungeonNeighbors(map,queue[i])){
          const key=p.x+":"+p.z;
          if(keys.has(key)&&!seen.has(key)){seen.add(key);queue.push(p);}
        }
        assert.equal(seen.size,cells.length,"Every room footprint must be internally connected");
      }
      assert.equal(map.rooms.reduce((n,r)=>n+dungeonRoomCells(map,r).length,0),map.tiles.filter(t=>t==="room").length);
      assert.equal(map.tiles.length,width*height);
      assert.equal(map.features.length,16);
    }
  }
});

test("rooms remain connected when any one corridor tile is blocked",()=>{
  for(const seed of [42,7351,9321,2026])for(const floor of [1,5,9]){
    const map=generateExpeditionLayout(seed,floor);
    for(let i=0;i<map.tiles.length;i++){
      if(map.tiles[i]!=="corridor")continue;
      const tiles=[...map.tiles];tiles[i]="wall";
      const changed={...map,tiles};
      for(const room of map.rooms.slice(1)){
        assert(dungeonShortestPath(changed,map.rooms[0],room).length>0,
          "Single blocked corridor must not isolate a chamber: "+seed+"/"+floor+"/"+i);
      }
    }
  }
});

test("production floors contain shaped chambers and real wider corridor runs without new dead ends",()=>{
  let shaped=0,wide=0;
  for(const seed of [0,1,42,7351,9321,2026,0xffffffff])for(let floor=1;floor<=9;floor++){
    const map=generateExpeditionLayout(seed,floor);
    shaped+=map.rooms.filter(r=>dungeonRoomCells(map,r).length<r.width*r.height).length;
    let hasBay=false;
    for(let z=1;z<map.height-2;z++)for(let x=1;x<map.width-2;x++){
      const horizontal=[0,1,2].every(i=>tileAt(map,x+i,z)==="corridor"&&tileAt(map,x+i,z+1)==="corridor");
      const vertical=[0,1,2].every(i=>tileAt(map,x,z+i)==="corridor"&&tileAt(map,x+1,z+i)==="corridor");
      if(horizontal||vertical)hasBay=true;
    }
    wide+=Number(hasBay);
    for(let i=0;i<map.tiles.length;i++)if(map.tiles[i]!=="wall"){
      const p={x:i%map.width,z:Math.floor(i/map.width)};
      if(p.x!==map.entrance.x||p.z!==map.entrance.z)
        assert(dungeonNeighbors(map,p).length>=2,"Unrewarded spur");
    }
  }
  assert(shaped>=63,"Shape variation must be common, not an exceptional seed");
  assert(wide>=32,"Wider corridors must be common across production layouts");
});
