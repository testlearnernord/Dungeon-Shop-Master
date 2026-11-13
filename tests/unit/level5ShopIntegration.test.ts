import test from "node:test";
import assert from "node:assert/strict";
import {createLevel5Room,excavateLevel5Cell,isValidLevel5Room,type Level5Room}
  from "../../src/game/level5Room.ts";
import {level5RockFaces} from "../../src/game/level5WallFaces.ts";
import {createShopLayout,shopLayoutProblem,type ShopLayout}
  from "../../src/game/shopLayout.ts";
import {idleShopPositions} from "../../src/game/npcTraffic.ts";
import {isObstructed,pathToShopGoal} from "../../src/game/shopperNavigation.ts";

function opened(...cells:readonly string[]):Level5Room {
  return {...createLevel5Room(),expansionTier:1,excavatedCells:[...cells]};
}
test("excavation excludes non-rendered rooms and protected entrances",()=>{
  const room=opened();
  assert.equal(excavateLevel5Cell(room,{x:0,z:8}).ok,false);
  assert.equal(excavateLevel5Cell(room,{x:8,z:7}).ok,false);
  assert.equal(isValidLevel5Room(opened("0,8")),false);
  assert.equal(isValidLevel5Room(opened("8,7")),false);
  const mined=excavateLevel5Cell(room,{x:8,z:0});
  assert.equal(mined.ok,true);
  if(mined.ok)assert.equal(isValidLevel5Room(mined.room),true);
});
test("every exposed rock edge matches an air/solid boundary",()=>{
  const room=opened("8,0","9,0","8,1");
  const faces=level5RockFaces(room);
  assert.equal(faces.some(f=>f.x===7.5&&f.z===0),false,
    "original side wall must open only where mined");
  assert.equal(faces.some(f=>f.x===7.5&&f.z===2&&f.mineCell?.z===2),true,
    "remaining side faces stay mineable");
  assert.equal(faces.some(f=>f.x===9.5&&f.z===0&&f.mineCell!==undefined),false,
    "outer rim is a solid cap until next tier");
  assert.equal(faces.some(f=>f.x===9.5&&f.z===0),true);
  assert.equal(faces.some(f=>f.x===8&&f.z===1.5&&f.mineCell?.z===2),true,
    "sideways mining exposes selectable rock instead of invisible cells");
  assert.equal(faces.some(f=>f.x===8.5&&f.z===0),false,
    "two excavated neighbours cannot have an interior wall");
  assert.equal(faces.every(f=>f.width<=1&&f.depth<=1),true);
});
test("new tunnels and layout share the same collision and pathfinding space",()=>{
  const room=opened("8,0","8,1","8,2","8,3","8,4","9,0");
  const layout=createShopLayout();
  assert.equal(shopLayoutProblem(layout,room),null);
  assert.equal(isObstructed({x:8,z:0},layout,room),false);
  assert.equal(isObstructed({x:9,z:1},layout,room),true);
  const route=pathToShopGoal({x:6,z:4},{x:8,z:0},layout,room);
  assert.ok(route,"a customer should reach mined floor through a real entrance around the shelf");
  assert.equal(pathToShopGoal({x:6,z:4},{x:8,z:0},layout,opened("8,0")),null,
    "a blocked wall shelf must not let NPCs teleport into an isolated tunnel");
  const points=idleShopPositions(layout,30,room);
  assert.ok(points.length>0);
  assert.ok(points.every(p=>!isObstructed(p,layout,room)));
  assert.deepEqual(idleShopPositions(layout,10,room),points.slice(0,10),
    "wait spots should reuse the cached destinations");
  const closed=opened();
  const other=idleShopPositions(layout,30,closed);
  assert.ok(other.every(p=>!isObstructed(p,layout,closed)),
    "changing room invalidates cached spots");
});
test("furniture cannot be placed on unmined rock",()=>{
  const room=opened("8,-3","8,-2","8,-1","8,0","8,1","8,2","8,3");
  const layout=createShopLayout();
  const moved:ShopLayout={...layout,shelves:layout.shelves.map(s=>
    s.id==="shelf-1"?{...s,x:8,z:0,rotation:0 as const}:s)};
  assert.match(shopLayoutProblem(moved,room)??"",/wall/);
});
