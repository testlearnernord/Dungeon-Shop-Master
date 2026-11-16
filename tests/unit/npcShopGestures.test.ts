import assert from "node:assert/strict";
import test from "node:test";
import {customerAttention,npcShopPose,type NpcShopGestureInput} from "../../src/game/npcShopGestures.ts";

const base:Readonly<NpcShopGestureInput>={
  phase:"queueing",shoppingPhase:"waiting-for-next-day",reason:"no-need",
  moving:false,time:4,slot:2,carrying:false,
  confirmedAction:null,confirmedSeconds:0,conversing:false,
};
const pose=(changes:Partial<NpcShopGestureInput>={})=>
  npcShopPose({...base,...changes});

test("shelf inspection visibly reaches and looks down, but checking unavailable stock does not fake a pickup",()=>{
  const inspect=pose({phase:"considering",shoppingPhase:"considering-item"});
  assert.equal(inspect.gesture,"inspect");
  assert(inspect.rightArm>.4);
  assert(inspect.headPitch>.15);
  assert(inspect.torsoLean>0);
  const missing=pose({phase:"considering",shoppingPhase:"checking-availability"});
  assert.equal(missing.gesture,"idle");
  assert.equal(missing.rightArm,0);
  assert.equal(missing.headPitch<=.025,true);
});

test("only a confirmed pickup or sale causes reaching or payment gestures",()=>{
  const pretending=pose({phase:"browsing",shoppingPhase:"approaching-shelf",moving:true});
  assert.equal(pretending.gesture,"walking");
  assert.equal(pretending.rightArm,0);
  const taken=pose({
    phase:"browsing",shoppingPhase:"walking-to-checkout",moving:true,
    confirmedAction:"pickup",confirmedSeconds:.55,
  });
  assert.equal(taken.gesture,"pickup");
  assert(taken.rightArm>.8);
  const expired=pose({
    phase:"browsing",moving:true,confirmedAction:"pickup",
    confirmedSeconds:0,
  });
  assert.equal(expired.gesture,"walking");
  const sold=pose({confirmedAction:"paid",confirmedSeconds:.48,carrying:true});
  assert.equal(sold.gesture,"paid");
  assert(sold.leftArm>.35);
  assert(sold.rightArm<.13);
});

test("credit and restock customers have different, bounded, nonwalking gestures",()=>{
  const restock=pose({shoppingPhase:"waiting-for-restock"});
  const credit=pose({shoppingPhase:"waiting-for-credit"});
  assert.equal(restock.gesture,"restock");
  assert.equal(credit.gesture,"credit");
  assert(restock.rightArm>restock.leftArm);
  assert(credit.leftArm>restock.leftArm);
  for(const state of ["waiting-for-restock","waiting-for-restock-overflow",
    "waiting-for-credit","waiting-for-credit-overflow"]){
    const item=pose({shoppingPhase:state,moving:true});
    assert.equal(item.gesture,"walking",
      "requests must not point upward while crossing an aisle");
  }
  assert.equal(pose({shoppingPhase:"roaming-request",
    reason:"cannot-afford"}).gesture,"credit");
  assert.equal(pose({shoppingPhase:"roaming-request",
    reason:"unavailable"}).gesture,"restock");
  const requestConversation=pose({conversing:true,moving:false});
  assert.equal(requestConversation.gesture,"conversation");
  assert(requestConversation.rightArm>0);
});

test("cashier customers stand differently from idle patrons and walking shoppers",()=>{
  const atTill=pose({shoppingPhase:"awaiting-checkout",carrying:true});
  assert.equal(atTill.gesture,"checkout");
  assert(atTill.leftArm>0);
  assert(atTill.rightArm>0);
  assert.equal(pose({shoppingPhase:"awaiting-checkout",moving:true}).gesture,"walking");
  assert.equal(pose({shoppingPhase:"checkout-capacity-full"}).gesture,"idle");
});

test("visual poses are deterministic, finite and cannot modify the input or economy",()=>{
  const input=Object.freeze({...base,phase:"considering",
    shoppingPhase:"considering-item",time:99.7,slot:7});
  const a=npcShopPose(input),b=npcShopPose(input);
  assert.deepEqual(a,b);
  assert.deepEqual(input,{...base,phase:"considering",
    shoppingPhase:"considering-item",time:99.7,slot:7});
  for(const variant of [
    pose({time:Infinity,slot:NaN}),
    pose({time:-1e6,slot:-3,confirmedAction:"pickup",confirmedSeconds:NaN}),
    pose({time:1e8,slot:100,shoppingPhase:"waiting-for-credit"}),
  ]){
    for(const value of Object.values(variant))
      if(typeof value==="number")assert(Number.isFinite(value));
  }
});

test("customers hold a glance, rest, and gesture only briefly instead of constant arm pumping",()=>{
  const scan0=customerAttention(0,0);
  const scan3=customerAttention(3,0);
  const scan6=customerAttention(6,0);
  const scan9=customerAttention(9,0);
  assert.equal(scan0.glance,0);
  assert.equal(scan3.glance,1);
  assert.equal(scan6.glance,0);
  assert.equal(scan9.glance,-1);
  assert.equal(scan0.signal,0);
  assert.equal(customerAttention(1.5,0).signal,1);
  assert.equal(customerAttention(5,0).signal,0);
  const signaled=npcShopPose({...base,time:1.5,slot:0,
    shoppingPhase:"waiting-for-restock",reason:"unavailable"});
  const relaxed=npcShopPose({...base,time:5,slot:0,
    shoppingPhase:"waiting-for-restock",reason:"unavailable"});
  assert(signaled.rightArm>relaxed.rightArm+.3,
    "restock request must not pump its hand indefinitely");
  assert.deepEqual(customerAttention(NaN,NaN),customerAttention(0,0));
  for(const frame of [0,.2,1,2,5,9,12,25])
    for(const value of Object.values(customerAttention(frame,2))){
      assert(Number.isFinite(value));
      assert(Math.abs(value)<=1);
    }
});
