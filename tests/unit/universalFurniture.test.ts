import assert from "node:assert/strict";
import test from "node:test";
import {FURNITURE_REGISTRY,furnitureBounds,furnitureTouchesActor,
  type FurnitureKind} from "../../src/game/furnitureRegistry.ts";
import {FURNITURE_CATALOG,blueprintAtSurface,surfaceFromMesh} from
  "../../src/game/furnitureBlueprint.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createGameState,advanceDay} from "../../src/game/gameState.ts";
import {createLevel5Room,excavateLevel5Cell,type Level5Room} from
  "../../src/game/level5Room.ts";
import {rosterBoardAtWall,rosterBoardProblem} from
  "../../src/game/rosterBoardPlacement.ts";
import {shopServiceReachabilityProblem} from
  "../../src/game/shopServiceReachability.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

function carvedWall():Level5Room{
  let room:Level5Room={...createLevel5Room(),expansionTier:2};
  // Real connected 1m-cell excavation, with a full-width exposed rock wall
  // at x=9.5. A board cannot float on a one-metre wall stub.
  for(let x=8;x<=9;x++)for(let z=-3;z<=3;z++){
    const next=excavateLevel5Cell(room,{x,z});
    assert(next.ok,JSON.stringify(next));
    room=next.room;
  }
  return room;
}

test("all eight furniture types share one geometry and mounting registry",()=>{
  const ids:FurnitureKind[]=[
    "shelf-1","shelf-2","counter","desk","chest","candle","bed",
    "adventurer-board",
  ];
  assert.deepEqual(Object.keys(FURNITURE_REGISTRY),ids);
  for(const id of ids){
    const def=FURNITURE_REGISTRY[id];
    const visual=FURNITURE_CATALOG.find(x=>x.id===id);
    assert(visual,"Blueprint catalog must register "+id);
    assert.equal(visual.width,def.width);
    assert.equal(visual.depth,def.depth);
    assert.equal(visual.height,def.height);
    assert(def.width>0&&def.depth>0&&def.height>0);
    assert(["shop-floor","private-floor","shop-wall"].includes(def.mount));
    for(const rotation of [0,1,2,3] as const){
      const pose={id,x:0,z:0,rotation};
      const bounds=furnitureBounds(pose);
      assert(bounds.maxX>bounds.minX&&bounds.maxZ>bounds.minZ);
      assert(Number.isFinite(bounds.minX));
      if(def.collides){
        const center={x:(bounds.minX+bounds.maxX)/2,
          z:(bounds.minZ+bounds.maxZ)/2,radius:0.1};
        assert(furnitureTouchesActor(pose,center));
      }else{
        assert(!furnitureTouchesActor(pose,{x:0,z:0,radius:.5}));
      }
    }
  }
});

test("bed, desk and counter use one authoritative preview/commit API",()=>{
  const original=createGameState(7351),store=new GameStore(original);
  const desk={id:"desk" as const,x:-2.25,z:-9.75,rotation:1 as const};
  assert.equal(store.previewFurniturePlacement(desk),null);
  assert.equal(store.placeFurniture(desk),"Bedroom furniture placed.");
  const accepted=store.state;
  assert.equal(accepted.bedroomFurniture?.find(x=>x.id==="desk")?.z,-9.75);
  const bad={id:"bed" as const,x:4,z:-10,rotation:0 as const};
  const error=store.previewFurniturePlacement(bad);
  assert(error);
  assert.equal(store.placeFurniture(bad),error);
  assert.strictEqual(store.state,accepted,"rejection cannot mutate state");
  const counter={id:"counter" as const,x:0,z:2.25,rotation:1 as const};
  assert.equal(store.previewFurniturePlacement(counter),null);
  assert.equal(store.placeFurniture(counter),"Counter placement saved.");
  assert.equal(shopServiceReachabilityProblem(
    store.state.shopLayout,store.state.level5Room),null);
  assert.deepEqual(advanceDay(store.state).state.shopEconomy,
    advanceDay({...original,
      bedroomFurniture:store.state.bedroomFurniture,
      shopLayout:original.shopLayout,
    }).state.shopEconomy,
    "decorator operations cannot change the authoritative sales simulator");
  const saved=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(saved.shopLayout,store.state.shopLayout);
  assert.deepEqual(saved.bedroomFurniture,store.state.bedroomFurniture);
});

test("universal wall furniture mounts to real mined wall, survives saves and blocks destructive mining",()=>{
  const initial=createGameState(7351);
  const room=carvedWall(),store=new GameStore({...initial,level5Room:room});
  assert.equal(surfaceFromMesh(
    "excavation-rock-face-9.5:0:0.4:1:10:0:false"),"rock-wall");
  const board=rosterBoardAtWall("rock-wall",{x:9.45,z:0},room);
  assert(board);
  assert.deepEqual(board,{x:9.25,z:0,rotation:1});
  assert.equal(rosterBoardProblem(board,store.state.shopLayout,room),null);
  const draft={id:"adventurer-board" as const,...board};
  assert.deepEqual(blueprintAtSurface("adventurer-board",
    "rock-wall",{x:9.45,z:0},0,room),draft);
  assert.equal(store.previewFurniturePlacement(draft),null);
  assert.equal(store.placeFurniture(draft),"Adventurer board placed.");
  const originalState=store.state;
  assert.equal(store.excavateShopCell({x:10,z:0}),
    "Move the Adventurer Board before mining its supporting rock.");
  assert.strictEqual(store.state,originalState,
    "blocked excavation must not alter topology or persistence");
  assert.equal(store.previewFurniturePlacement({
    id:"adventurer-board",x:9.25,z:0,rotation:2,
  })!==null,true);
  const loaded=parseSave(JSON.stringify(createSave(store.state)));
  assert.deepEqual(loaded.rosterBoard,board);
  assert.deepEqual(loaded.level5Room,room);
  assert.equal(store.placeFurniture({
    id:"adventurer-board",x:-5.55,z:-6.45,rotation:2,
  }),"Adventurer board placed.");
  assert.equal(store.excavateShopCell({x:10,z:0}),"Rock excavated.");
  assert(store.state.level5Room?.excavatedCells.includes("10,0"));
});

test("a single rock cell cannot support a wall-wide Adventurer Board",()=>{
  let room:Level5Room={...createLevel5Room(),expansionTier:1};
  const dug=excavateLevel5Cell(room,{x:8,z:0});
  assert(dug.ok);room=dug.room;
  const board=rosterBoardAtWall("rock-wall",{x:8.45,z:0},room);
  assert(board);
  assert(rosterBoardProblem(board,createGameState().shopLayout,room),
    "3.45m frame needs continuous stone support, not one exposed cell");
});
