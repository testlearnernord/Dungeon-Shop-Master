import {expect,test} from "@playwright/test";
test("real board and room after clipping/collision fix",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).stageBedchamberCleanupFrame("shop"));
  await page.waitForTimeout(1200);
  await page.locator("#renderCanvas").screenshot({path:"bedroom-regression-preview/01-board-and-sign.png"});
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).stageBedchamberCleanupFrame("bedroom"));
  await page.waitForTimeout(900);
  await page.locator("#renderCanvas").screenshot({path:"bedroom-regression-preview/02-solid-furniture.png"});
});