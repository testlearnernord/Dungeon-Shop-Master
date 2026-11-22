import {expect,test} from "@playwright/test";

test("deleted right exit is airtight continuous cave rock and never a wall-mounted blueprint @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const check=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFormerRightExit());
  const before=await check();
  expect(before.wallContinuous).toBe(true);
  expect(before.allRaysHitRock).toBe(true);
  expect(before.oldPlugExists).toBe(false);
  expect(before.oldRightWallExists).toBe(false);
  expect(before.actualPortalClear).toBe(true);

  const oldLayout=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout;
  });
  await page.locator("#build-shelf").click();
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFormerRightExit());
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),{
    timeout:10000,
  }).toContain("unsupported mount");
  await expect(page.locator("#blueprint-panel .blueprint-status")).toHaveAttribute("data-valid","false");
  const ghost=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFormerRightExit().ghostEnabled);
  expect(ghost).toBe(false);
  await page.mouse.click(400,300);
  const after=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout;
  });
  expect(after).toEqual(oldLayout);
  expect((await check()).allRaysHitRock).toBe(true);
  expect(errors).toEqual([]);
});
