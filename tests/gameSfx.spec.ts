import { expect, test } from "@playwright/test";

test("independent SFX mute and volume survive reload and boss viewer lifecycle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  await page.locator("#sfx-toggle").click();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX off");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await page.locator("#sfx-volume").evaluate((slider: HTMLInputElement) => {
    slider.value = "27";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX off");
  await expect(page.locator("#sfx-volume")).toHaveValue("27");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");

  const gold = await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#sfx-toggle").click();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  await page.keyboard.press("Space");
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-model-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  expect(errors).toEqual([]);
});
