import { expect,test } from "@playwright/test";

const aim=async(page:import("@playwright/test").Page,name="cash-register")=>{
  await page.evaluate(async(meshName)=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFurniture(meshName),name);
};

test("aim at real furniture then P: visual front arrow, 90-degree R rotation, free FPS look and persisted placement",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await aim(page);
  await expect(page.locator("#furniture-look-prompt")).toContainText("Checkout counter · P to move");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id??null),
    {timeout:5000}).toBe("renderCanvas");
  await expect(page.locator("#blueprint-panel h2")).toContainText("Checkout counter");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBlueprintFloor());
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),
    {timeout:10000}).toContain("NORTH");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:10000}).toBe("true");
  await page.keyboard.press("r");
  await expect(page.locator("#blueprint-facing")).toContainText("WEST");
  await expect(page.locator("#blueprint-facing")).toContainText("90°");
  const arrow=await page.evaluate(async()=>{
    const {Engine}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return document.querySelector("#blueprint-facing")?.textContent??"";
  });
  expect(arrow).toContain("WEST");
  // Pointer lock remains in force. A player can look around without
  // an artificial 180-degree cursor constraint or losing the blueprint.
  expect(await page.evaluate(()=>document.pointerLockElement?.id)).toBe("renderCanvas");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.shopLayout.counter?.rotation;
  }),{timeout:10000}).toBe(1);
  await page.reload();
  const placement=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout.counter;
  });
  expect(placement?.rotation).toBe(1);
  expect(placement?.z).toBe(0);
  expect(errors).toEqual([]);
});

test("contextual P refuses empty crosshair; RMB cancels a valid preview without changing inventory",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBlueprintFloor());
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect(page.locator("#furniture-look-prompt")).toContainText("Look directly");
  const before=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  await aim(page);
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.locator("#blueprint-facing")).toContainText("90°");
  await page.mouse.click(400,300,{button:"right"});
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const after=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(after?.shopLayout).toEqual(before?.shopLayout);
  expect(after?.shopEconomy).toEqual(before?.shopEconomy);
});
