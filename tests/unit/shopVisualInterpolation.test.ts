import assert from "node:assert/strict";
import test from "node:test";
import {interpolateSavedShopPose} from "../../src/game/shopVisualInterpolation.ts";
import {WorldClockPacer,REAL_MS_PER_WORLD_TICK}
  from "../../src/game/worldClockPacer.ts";

test("shop characters blend between saved 50ms positions without mutating physical state",()=>{
  const previous={x:-3,z:0,yaw:0.1};
  const committed={x:1,z:8,yaw:1.2};
  const old=structuredClone(previous),next=structuredClone(committed);
  assert.deepEqual(interpolateSavedShopPose(previous,committed,0),previous);
  assert.deepEqual(interpolateSavedShopPose(previous,committed,1),committed);
  const halfway=interpolateSavedShopPose(previous,committed,.5);
  assert.equal(halfway.x,-1);
  assert.equal(halfway.z,4);
  assert(Math.abs(halfway.yaw-.65)<1e-12);
  assert.deepEqual(previous,old);
  assert.deepEqual(committed,next);
  assert.deepEqual(interpolateSavedShopPose(previous,committed,-100),previous);
  assert.deepEqual(interpolateSavedShopPose(previous,committed,100),committed);
  assert.throws(()=>interpolateSavedShopPose(previous,committed,NaN),/factor/);
});

test("heading interpolation takes the shortest turn across the -PI/PI seam",()=>{
  const from={x:0,z:0,yaw:Math.PI-.1};
  const to={x:0,z:0,yaw:-Math.PI+.1};
  const half=interpolateSavedShopPose(from,to,.5);
  assert(Math.abs(half.yaw-Math.PI)<1e-9,
    "Crossing the seam must not spin a full 360 degrees");
});

test("fractional render progress does not commit or skip a world tick",()=>{
  const clock=new WorldClockPacer();
  let committed=0;
  clock.step(REAL_MS_PER_WORLD_TICK*.6,false,n=>{committed+=n;});
  assert.equal(committed,0);
  assert(Math.abs(clock.presentationAlpha-.6)<1e-12);
  clock.step(REAL_MS_PER_WORLD_TICK*.5,false,n=>{committed+=n;});
  assert.equal(committed,1);
  assert(Math.abs(clock.presentationAlpha-.1)<1e-12);
  clock.setPaused("dialog",true);
  assert.equal(clock.presentationAlpha,0);
  clock.step(REAL_MS_PER_WORLD_TICK*100,true,n=>{committed+=n;});
  assert.equal(committed,1);
});
