import { expect, test } from "@playwright/test";

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
  await expect(page.locator(".group-combat-cinematic")).toBeHidden();
  // The curated Tripo candidate is a read-only built-in viewer preset.
  await page.locator("#arena-model-preset").selectOption("ashen-mauler-tripo");
  await expect(page.locator("#arena-model-info")).toContainText("12 imported clips",{timeout:30000});
  await expect(page.locator("#arena-model-clip option")).toHaveCount(12);
  await page.locator("#arena-model-clip").selectOption({label:"2. walk_heavy"});
  await expect(page.locator("#arena-model-info")).toContainText("Playing walk_heavy");
  // Local File import remains available, including a GLB with no animation.
  await page.locator("#arena-model-file").setInputFiles("public/assets/models/ashen-mauler-sculpt.glb");
  await expect(page.locator("#arena-model-info")).toContainText("no animation clips",{timeout:15000});
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-model-viewer","false");
  await expect(page.locator(".group-combat-cinematic")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#day")).toHaveText("Day 1");
  expect(errors).toEqual([]);
});
