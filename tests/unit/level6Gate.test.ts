import assert from "node:assert/strict";
import test from "node:test";
import {SHOP_PORTAL_GATE,SHOP_PORTAL_X,shopPortalTravelLane,
  insideShopPortalCorridor,inShopPortalThroat,
  overlapsShopPortalClearance} from "../../src/game/shopPortal.ts";

test("one portal has distinct inbound/outbound lanes and no right-gate escape",()=>{
  assert.equal(SHOP_PORTAL_GATE,"portal");
  assert.equal(SHOP_PORTAL_X,-4);
  assert.equal(shopPortalTravelLane("entering"),-4.57);
  assert.equal(shopPortalTravelLane("leaving"),-3.43);
  assert.equal(insideShopPortalCorridor({x:-4.57,z:8}),true);
  assert.equal(insideShopPortalCorridor({x:4,z:8}),false);
  assert.equal(inShopPortalThroat({x:-4,z:7}),true);
  assert.equal(inShopPortalThroat({x:4,z:7}),false);
});
test("both actual portal clearance and permanently sealed right opening block construction",()=>{
  assert(overlapsShopPortalClearance({minX:-4.5,maxX:-3.5,minZ:4,maxZ:5}));
  assert(overlapsShopPortalClearance({minX:3.5,maxX:4.5,minZ:4,maxZ:5}));
  assert.equal(overlapsShopPortalClearance({
    minX:-1,maxX:0,minZ:-2,maxZ:-1,
  }),false);
});
