import { expect, test } from "@playwright/test";

test("shop placement previews, cancels, commits and persists shelf+stock transforms",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectShopPlacement());
  const original=await inspect();
  expect(original.left.root?.x).toBe(-7);
  expect(original.left.root?.z).toBe(0);
  expect(original.left.item).not.toBeNull();
  await page.locator("#open-placement").click();
  await expect(page.locator("#shelf-placement")).toBeVisible();
  const backwards=page.getByRole("button",{name:"↑ Back"});
  await backwards.click();
  await expect(page.locator("#placement-coordinates")).toContainText("Z -0.25");
  const moved=await inspect();
  expect(moved.left.root?.z).toBe(-0.25);
  expect(moved.left.slot?.z).toBeCloseTo(original.left.slot!.z-0.25,4);
  expect(moved.left.item?.z).toBeCloseTo(original.left.item!.z-0.25,4);
  expect(moved.left.guideEnabled).toBe(true);
  await page.locator("#placement-cancel").click();
  await expect(page.locator("#shelf-placement")).toBeHidden();
  const cancelled=await inspect();
  expect(cancelled.left.root?.z).toBe(0);
  expect(cancelled.left.guideEnabled).toBe(false);
  const beforeSave=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(beforeSave?.shopLayout.shelves[0].z).toBe(0);

  await page.keyboard.press("Shift+p");
  await expect(page.locator("#shelf-placement")).toBeVisible();
  await backwards.click();
  await page.locator("#placement-save").click();
  await expect(page.locator("#shelf-placement")).toBeHidden();
  const afterSave=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(afterSave?.shopLayout.shelves[0].z).toBe(-0.25);
  expect(afterSave?.shopEconomy.slots.find(s=>s.id==="shelf-1-slot-2")?.quantity).toBe(3);
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 1.");
  const persisted=await inspect();
  expect(persisted.left.root?.z).toBe(-0.25);
  expect(persisted.left.item).not.toBeNull();
  expect(persisted.left.guideEnabled).toBe(false);
  expect(persisted.right.root?.x).toBe(7);
  expect(errors).toEqual([]);
});

test("invalid shelf moves display red ghost and never modify the campaign",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-placement").click();
  await page.locator("#placement-rotate").click();
  await expect(page.locator("#placement-save")).toBeDisabled();
  await expect(page.locator("#placement-status")).toContainText("wall");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectShopPlacement());
  const ghost=await inspect();
  expect(ghost.left.root?.rotation).toBeCloseTo(Math.PI/2,5);
  await page.keyboard.press("Escape");
  await expect(page.locator("#shelf-placement")).toBeHidden();
  expect((await inspect()).left.root?.rotation).toBe(0);
  await page.locator("#open-placement").click();
  await page.locator("#placement-shelf").selectOption("shelf-2");
  await expect(page.locator("#placement-coordinates")).toContainText("shelf-2");
  await page.locator("#placement-cancel").click();
  await page.reload();
  const after=await inspect();
  expect(after.left.root?.x).toBe(-7);
  expect(after.right.root?.x).toBe(7);
});
