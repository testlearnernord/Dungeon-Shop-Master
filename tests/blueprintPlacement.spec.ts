import { expect,test } from "@playwright/test";

test("Blueprint editor places a counter by aiming at a real floor surface",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBlueprintFloor());
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.locator('[data-furniture-id="counter"]')).toHaveAttribute("aria-pressed","true");
  await page.mouse.move(400,300);
  await expect.poll(async()=>page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:10000}).toBe("true");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.shopLayout.counter?.z;
  }),{timeout:10000}).toBe(0);
  await page.reload();
  const z=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout.counter?.z;
  });
  expect(z).toBe(0);
  expect(errors).toEqual([]);
});

test("Right click cancels a blueprint without moving furniture or changing stock",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const original=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())!;
  });
  await page.locator("#open-blueprint").click();
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.mouse.click(400,300,{button:"right"});
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const after=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())!;
  });
  expect(after.shopLayout).toEqual(original.shopLayout);
  expect(after.shopEconomy).toEqual(original.shopEconomy);
});
