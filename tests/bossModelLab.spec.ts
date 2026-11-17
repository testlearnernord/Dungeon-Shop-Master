import { expect, test } from "@playwright/test";

test("training rematches vary but leave campaign state untouched",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const gold=await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  const first=await page.locator("#arena-hud").getAttribute("data-training-scenario");
  const label=await page.locator("#arena-preview").textContent();
  expect(first).toMatch(/^training-/);
  await page.locator("#restart-arena").click();
  const next=await page.locator("#arena-hud").getAttribute("data-training-scenario");
  expect(next).not.toBe(first);
  expect(await page.locator("#arena-preview").textContent()).not.toBe(label);
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
});

test("local GLB model inspector shares spectator canvas but does not mutate combat",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const gold=await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-model-viewer","true");
  await expect(page.locator("#arena-model-panel")).toBeVisible();
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  // The already checked-in sculpt has no animation tracks. This verifies
  // local File import without introducing the owner's 13-MB Tripo asset.
  await page.locator("#arena-model-file").setInputFiles("public/assets/models/ashen-mauler-sculpt.glb");
  await expect(page.locator("#arena-model-info")).toContainText("no animation clips",{timeout:15000});
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-model-viewer","false");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#day")).toHaveText("Day 1");
  expect(errors).toEqual([]);
});
