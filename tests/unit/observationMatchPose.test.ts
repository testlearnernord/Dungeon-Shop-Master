import assert from "node:assert/strict";
import test from "node:test";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {tableDioramaFit,TABLE_DIORAMA_WELL}
  from "../../src/game/tableDioramaGeometry.ts";
import {DUNGEON_WORLD_TILE_SIZE}
  from "../../src/game/dungeonObservationOrientation.ts";
import {observationMatchPose,observationEase,observationVeil,
  OBSERVATION_MATCH_FOV} from "../../src/game/observationMatchPose.ts";

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,
  `Expected ${a} ≈ ${b}`);

test("table and LIVE use one north-facing, matching frame on ordinary floors",()=>{
  for(const floor of [1,5,6,10]){
    const layout=generateExpeditionLayout(7351,floor);
    const match=observationMatchPose(layout);
    const fit=tableDioramaFit(layout);
    assert.equal(match.live.x,0);
    assert.equal(match.live.z,0);
    assert.equal(match.live.yaw,0);
    assert.equal(match.fov,OBSERVATION_MATCH_FOV);
    near(match.tableTarget.x,0);
    near(match.tableTarget.y,TABLE_DIORAMA_WELL.floorY);
    near(match.tableTarget.z,TABLE_DIORAMA_WELL.centerZ);
    assert.ok(match.tableEye.z>match.tableTarget.z,
      "furniture front is +local Z after the diorama PI rotation");
    assert.ok(match.tableEye.y>match.tableTarget.y);
    const xScale=fit.tileWidth/DUNGEON_WORLD_TILE_SIZE;
    const zScale=fit.tileDepth/DUNGEON_WORLD_TILE_SIZE;
    near(xScale*layout.width*DUNGEON_WORLD_TILE_SIZE,fit.coreWidth);
    near(zScale*layout.height*DUNGEON_WORLD_TILE_SIZE,fit.coreDepth);
    near((match.tableEye.y-match.tableTarget.y)/
      (match.tableEye.z-match.tableTarget.z),Math.tan(match.live.pitch));
  }
});

test("match validates dimensions; easing and visual mask are bounded and reversible",()=>{
  assert.throws(()=>observationMatchPose({width:0,height:8}),RangeError);
  assert.throws(()=>observationMatchPose({width:3.5,height:8}),RangeError);
  assert.throws(()=>observationMatchPose({width:8,height:Infinity}),RangeError);
  for(const t of [-2,-.5,0,.1,.25,.5,.75,1,2]){
    const eased=observationEase(t);
    assert.ok(eased>=0&&eased<=1);
    near(observationEase(t),1-observationEase(1-t));
    for(const phase of ["shop","live"] as const){
      const opacity=observationVeil(phase,t);
      assert.ok(opacity>=0&&opacity<=.93);
    }
  }
  near(observationVeil("shop",1),observationVeil("live",0));
  near(observationVeil("shop",0),0);
  near(observationVeil("live",1),0);
});
