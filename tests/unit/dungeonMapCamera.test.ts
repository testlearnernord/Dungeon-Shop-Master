import assert from "node:assert/strict";
import test from "node:test";
import {mapPoseFromCamera,mapCameraPosition,mapCameraTarget,
  orbitDungeonMap,zoomDungeonMap,panDungeonMap,dungeonNorthNeedleDegrees}
  from "../../src/game/dungeonMapCamera.ts";

test("W and S move forward/back in the correct orientation and A/D remain lateral",()=>{
  const start=mapPoseFromCamera({x:0,y:66,z:-22},{x:0,y:0,z:0});
  assert.ok(Math.abs(start.yaw)<1e-8);
  const b={halfX:100,halfZ:100};
  const forward=panDungeonMap(start,0,1,5,b);
  const backward=panDungeonMap(start,0,-1,5,b);
  assert.ok(forward.z>start.z,"W must move toward the distant floor");
  assert.ok(backward.z<start.z,"S must move toward the camera");
  assert.ok(panDungeonMap(start,1,0,5,b).x>0);
  assert.ok(panDungeonMap(start,-1,0,5,b).x<0);
});

test("WASD follows screen directions at arbitrary camera yaw",()=>{
  const start={x:0,z:0,yaw:Math.PI/2,pitch:1,distance:50};
  const b={halfX:100,halfZ:100};
  assert.equal(panDungeonMap(start,0,1,5,b).x,-5);
  assert.ok(Math.abs(panDungeonMap(start,0,1,5,b).z)<1e-8);
  assert.equal(panDungeonMap(start,1,0,5,b).z,5);
  assert.ok(Math.abs(panDungeonMap(start,1,0,5,b).x)<1e-8);
  assert.equal(panDungeonMap(start,1,1,300,{halfX:10,halfZ:10}).x,-10);
  assert.equal(panDungeonMap(start,1,1,300,{halfX:10,halfZ:10}).z,10);
  const inverse=mapPoseFromCamera(mapCameraPosition(start),mapCameraTarget(start));
  assert.ok(Math.abs(inverse.yaw-start.yaw)<1e-8);
  assert.ok(Math.abs(inverse.pitch-start.pitch)<1e-8);
});

test("mouse freely orbits while north needle records the bearing",()=>{
  const pose={x:0,z:0,yaw:0,pitch:1.2,distance:70};
  const tilted=orbitDungeonMap(pose,150,-80);
  assert.ok(tilted.yaw>.8);
  assert.ok(orbitDungeonMap({...pose,yaw:2.5},10000,0).yaw>60);
  assert.equal(dungeonNorthNeedleDegrees(Math.PI/2),90);
  assert.equal(dungeonNorthNeedleDegrees(-Math.PI),-180);
  assert.ok(tilted.pitch<pose.pitch);
  assert.equal(orbitDungeonMap(pose,0,-10000).pitch,.32);
  assert.equal(orbitDungeonMap(pose,0,10000).pitch,1.48);
  assert.equal(zoomDungeonMap(pose,-100000).distance,Math.max(16,
    70*Math.exp(-.6)));
  assert.ok(zoomDungeonMap(pose,100000).distance<=115);
});
