import assert from "node:assert/strict";
import test from "node:test";
import {Vector3} from "@babylonjs/core/Maths/math.vector.js";
import {palmGripBetweenFingers,airborneRootFromGrip}
  from "../../src/game/tripoGripPresentation.ts";

test("real finger socket is a weighted point INSIDE the thumb/index/middle grip",()=>{
  const palm=new Vector3(1,2,3);
  const index=new Vector3(2,3,4);
  const middle=new Vector3(3,4,5);
  const thumb=new Vector3(4,5,6);
  const pocket=palmGripBetweenFingers(palm,index,middle,thumb);
  assert(Math.abs(pocket.x-(.12+2*.28+3*.21+4*.39))<1e-9);
  assert(pocket.x>palm.x && pocket.x<thumb.x);
  assert(pocket.y>palm.y && pocket.y<thumb.y);
  assert(pocket.z>palm.z && pocket.z<thumb.z);
  // Actual hand movement (including Y) must move the pocket by exactly
  // the same amount: no arbitrary boss-facing or static offset.
  const delta=new Vector3(-1.25,2.7,.84);
  const moved=palmGripBetweenFingers(palm.add(delta),index.add(delta),
    middle.add(delta),thumb.add(delta));
  assert(Vector3.Distance(moved,pocket.add(delta))<1e-9);
});

test("a released hero travels smoothly from the real fingers to motor landing",()=>{
  const release=new Vector3(2.5,5.2,-1.6);
  const motorAtRelease=new Vector3(0,0,2);
  const motorMid=new Vector3(3,0,3);
  const motorLanding=new Vector3(7.5,0,4);
  const first=airborneRootFromGrip(release,motorAtRelease,motorAtRelease,0);
  const mid=airborneRootFromGrip(release,motorAtRelease,motorMid,.5);
  const landed=airborneRootFromGrip(release,motorAtRelease,motorLanding,1);
  assert(Vector3.Distance(first,release)<1e-9,"no teleport at hand release");
  assert(mid.y>0 && mid.y<release.y+2,"a visible airborne arc");
  assert(Math.abs(landed.x-motorLanding.x)<1e-9);
  assert(Math.abs(landed.z-motorLanding.z)<1e-9);
  assert.equal(landed.y,0,"real landing stays on authored arena floor");
  for(const progress of [0,.01,.15,.5,.9,1]){
    const p=airborneRootFromGrip(release,motorAtRelease,motorLanding,progress);
    assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
  }
});
