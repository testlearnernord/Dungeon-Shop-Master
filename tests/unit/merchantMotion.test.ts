import test from "node:test";
import assert from "node:assert/strict";
import {merchantActionPose,merchantGaitPose,type MerchantAction}
  from "../../src/game/merchantMotion.ts";

test("every action returns arms to neutral after its cycle",()=>{
  for(const action of ["mine","stock","destock","checkout"] satisfies MerchantAction[]){
    for(const t of [0,1]){
      const pose=merchantActionPose(action,t);
      assert.ok(Math.abs(pose.leftPitch)<1e-12);
      assert.ok(Math.abs(pose.rightPitch)<1e-12);
      assert.ok(Math.abs(pose.rightRoll)<1e-12);
    }
  }
});
test("mining swings with a pick, stocking/destocking with goods, checkout with coins",()=>{
  assert.ok(merchantActionPose("mine",.5).rightPitch<-.9);
  assert.equal(merchantActionPose("mine",.5).toolVisible,true);
  assert.equal(merchantActionPose("mine",1).toolVisible,false);
  assert.equal(merchantActionPose("stock",.4).itemVisible,true);
  assert.equal(merchantActionPose("stock",.9).itemVisible,false);
  assert.equal(merchantActionPose("destock",.2).itemVisible,false);
  assert.equal(merchantActionPose("destock",.7).itemVisible,true);
  assert.equal(merchantActionPose("checkout",.5).coinVisible,true);
  assert.equal(merchantActionPose("checkout",1).coinVisible,false);
});
test("movement, not wall-clock time, animates opposite legs",()=>{
  const idle=merchantGaitPose(41,false);
  assert.equal(idle.leftSwing,0);
  assert.equal(idle.rightSwing,0);
  const walk=merchantGaitPose(.21,true);
  assert.ok(Math.abs(walk.leftSwing)>.1);
  assert.ok(Math.abs(walk.leftSwing+walk.rightSwing)<1e-12);
  assert.equal(walk.leftFootLift>0,walk.rightFootLift===0);
  assert.deepEqual(merchantGaitPose(NaN,true),idle);
});
