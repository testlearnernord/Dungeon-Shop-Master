import {expect,test} from "@playwright/test";
import {advanceTestDay} from "./advanceTestDay";

/** Real browser characters, one physical doorway, one visible seal. */
test("one cursed shop portal routes NPCs and keeps the old right entrance sealed @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const first=await inspect();
  expect(first.visitors).toHaveLength(3);
  expect(first.visitors.every(v=>v.gateSide==="portal")).toBe(true);
  expect(first.playerBarrierSolid).toBe(true);
  expect(first.sealedRightPassage).toBe(true);
  expect(first.hasSecondGate).toBe(false);
  expect(first.gateY).toBeDefined();
  await page.locator("#toggle-adventurer-details").click();
  const pass=page.locator("#adventurer-roster button.boss-pass").first();
  await expect(pass).toBeVisible();
  await pass.click();
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 2");
  const departing=await inspect();
  expect(departing.visitors.every(v=>v.gateSide==="portal")).toBe(true);
  expect(departing.playerBarrierSolid).toBe(true);
  expect(departing.sealedRightPassage).toBe(true);
  expect(departing.hasSecondGate).toBe(false);
  expect(errors).toEqual([]);
});
