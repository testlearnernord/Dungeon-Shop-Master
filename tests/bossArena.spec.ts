import { expect, test } from "@playwright/test";

test("Level 6 is a separate viewable boss cavern, camera focuses hero/boss and no saved tick advances", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const originalGold = await page.locator("#merchant-gold").textContent();

  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await expect(page.locator("#arena-preview")).toContainText("TRAINING PREVIEW");
  await expect(page.locator("#arena-focus")).toContainText("TAB focus:");
  await expect(page.locator("#arena-hero-health")).toContainText("HERO HP");
  const arena = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  const initial = await arena();
  expect(initial.boss).toBe(true);
  expect(initial.hero).toBe(true);
  expect(initial.lava).toBe(true);
  expect(initial.ring).toBe(true);
  expect(initial.spikes).toBe(34);
  await page.keyboard.press("Tab");
  await expect(page.locator("#arena-focus")).toContainText("CAVE TROLL");
  await page.keyboard.press("Tab");
  await expect(page.locator("#arena-focus")).not.toContainText("CAVE TROLL");
  await page.keyboard.down("w");
  await page.waitForTimeout(360);
  await page.keyboard.up("w");
  expect((await arena()).camera.z).not.toBe(initial.camera.z);
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-boss-health")).toContainText("145/145");
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-hud")).toBeHidden();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(originalGold!);
  await page.keyboard.press("v");
  await expect(page.locator("#arena-hud")).toBeVisible();
  await page.keyboard.press("v");
  await expect(page.locator("#arena-hud")).toBeHidden();
  expect(errors).toEqual([]);
});

test("an authorized Level 6 adventurer appears in the spectator preview without a double combat resolution", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const selected = page.locator('#adventurer-roster button.level6-permit').first();
  await selected.click();
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator('#adventurer-roster li[data-status="expedition"]')).toHaveCount(1);
  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-preview")).toContainText("EXPEDITION PREVIEW");
  await expect(page.locator("#arena-status")).not.toBeEmpty();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#level6-progress-summary")).toContainText("0 fights");
});

test("spatial AI visibly moves both actors and tracks stamina, attack phases and actual travel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const initialGold = await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  const arena = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  const first = await arena();
  await expect.poll(async () => (await arena()).heroDistanceTraveled ?? 0, {
    timeout: 25000, intervals: [250, 500, 1000],
  }).toBeGreaterThan(2);
  const current = await arena();
  expect(current.heroPosition).not.toEqual(first.heroPosition);
  expect(current.bossPosition).not.toEqual(first.bossPosition);
  await expect(page.locator("#arena-stamina")).toContainText("STAMINA");
  await expect(page.locator("#arena-combat-info")).toContainText("Troll:");
  expect(["move","roll","parry","attack","cast","heal","hurt","dead"]).toContain(current.heroPhase);
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(initialGold!);
  expect(errors).toEqual([]);
});
