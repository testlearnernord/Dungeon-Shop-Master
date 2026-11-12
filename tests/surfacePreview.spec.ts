import {expect,test} from "@playwright/test";
test("real shop and sleeping room render with textured surfaces",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const count=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimSurfacePreview("shop"));
  expect(count).toBe(3);
  await page.waitForTimeout(1300);
  await page.locator("#renderCanvas").screenshot({path:"material-preview/01-textured-shop.png"});
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimSurfacePreview("bedroom"));
  await page.waitForTimeout(1000);
  await page.locator("#renderCanvas").screenshot({path:"material-preview/02-textured-bedroom.png"});
});