import {test,expect} from "@playwright/test";
test("visual preview of the upgraded real bedroom",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const count=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimBedroomPreview());
  expect(count).toBeGreaterThan(40);
  await page.waitForTimeout(1200);
  await page.locator("#renderCanvas").screenshot({path:"bedroom-preview/galvik-bedroom-new-doorway.png"});
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimBedroomPreview(-1.5,-8.7);
  });
  await page.waitForTimeout(800);
  await page.locator("#renderCanvas").screenshot({path:"bedroom-preview/galvik-bedroom-new-closeup.png"});
});
