import { expect, test } from "@playwright/test";

test("music uses the correct deployed assets and tracks shop / boss scenes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-track")).toHaveText("The Last Warm Light");
  await expect(page.locator("#music-status")).toContainText("first click");
  const sources = await page.locator("#music-panel audio").evaluateAll(nodes =>
    nodes.map(node => (node as HTMLAudioElement).src));
  expect(sources).toHaveLength(2);
  expect(sources[0]).toMatch(/\/Dungeon-Shop-Master\/audio\/the-last-warm-light\.mp3$/);
  expect(sources[1]).toMatch(/\/Dungeon-Shop-Master\/audio\/trial-by-iron\.mp3$/);
  const gold = await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  await expect(page.locator("#music-track")).toHaveText("Trial by Iron");
  await page.locator("#close-arena").click();
  await expect(page.locator("#music-track")).toHaveText("The Last Warm Light");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  expect(errors).toEqual([]);
});

test("mute and volume persist across reloads independently of campaign state", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await page.locator("#music-toggle").click();
  await expect(page.locator("#music-toggle")).toHaveText("Unmute");
  await expect(page.locator("#music-status")).toHaveText("Music off");
  await page.locator("#music-volume").evaluate((slider: HTMLInputElement) => {
    slider.value = "17";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-toggle")).toHaveText("Unmute");
  await expect(page.locator("#music-volume")).toHaveValue("17");
  await page.locator("#music-toggle").click();
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
});
