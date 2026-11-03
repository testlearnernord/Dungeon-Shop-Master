import { expect, test } from "@playwright/test";

test("shop and boss draw the same persistent hero identity from one shared model factory", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", err => pageErrors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectHeroModels());
  const shop = await inspect();
  expect(shop.length).toBeGreaterThan(0);
  const chosen = shop.find(hero => hero.id === "adventurer-1")!;
  expect(chosen).toBeDefined();
  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  const arena = await inspect();
  const sameHero = arena.find(hero => hero.id === chosen.id && hero.rootName.startsWith("arena-hero-"));
  expect(sameHero).toBeDefined();
  expect(sameHero!.appearanceKey).toBe(chosen.appearanceKey);
  expect(sameHero!.skinColor).toBe(chosen.skinColor);
  expect(sameHero!.hairColor).toBe(chosen.hairColor);
  expect(sameHero!.role).toBe(chosen.role);
  expect(sameHero!.weapon).toBe(chosen.weapon);
  expect(sameHero!.armor).toBe(chosen.armor);
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  expect(pageErrors).toEqual([]);
});

test("shared model shows real equipped gear and not a free sword for the DPS role", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const models = await page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectHeroModels());
  expect(models.length).toBeGreaterThan(0);
  expect(models.every(hero => hero.weapon === null && !hero.swordVisible)).toBe(true);
  expect(models.every(hero => hero.armor === null && !hero.vestVisible)).toBe(true);
});
