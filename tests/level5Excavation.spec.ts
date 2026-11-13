import {expect,test} from "@playwright/test";

/** Regression for the real FPS pickaxe action, topology rebuilding and save
 * persistence. No direct GameStore writes are used to excavate the test cell. */
test("unlock, mine exposed rock and keep the opening after reloading",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.keyboard.press("u");
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.expansionTier;
  }),{timeout:10000}).toBe(1);
  const aimed=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtLevel5Rock(8,4));
  expect(aimed).toContain("excavation-rock-face-");
  // An unlocked cave MUST remain safe until the player explicitly arms mining.
  await page.keyboard.press("u");
  await expect(page.locator("#mining-mode-indicator")).toBeHidden();
  await page.mouse.click(400,300);
  const blocked=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.excavatedCells.includes("8,4");
  });
  expect(blocked).toBe(false);
  await page.keyboard.press("u");
  await expect(page.locator("#mining-mode-indicator")).toBeVisible();
  await page.mouse.click(400,300);
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.excavatedCells.includes("8,4");
  }),{timeout:10000}).toBe(true);
  const observe=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLevel5Rock(8,4));
  await expect.poll(async()=>(await observe()).floor).toBe(true);
  expect(await observe()).toEqual({floor:true,ceiling:true,clickableRock:false});
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect.poll(async()=>(await observe()).floor).toBe(true);
  expect(await observe()).toEqual({floor:true,ceiling:true,clickableRock:false});
  expect(errors).toEqual([]);
});
