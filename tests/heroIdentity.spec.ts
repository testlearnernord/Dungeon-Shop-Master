import { expect, test } from "@playwright/test";
import { createGameState } from "../src/game/gameState";
import { heroDisplayNames, heroPortraitIndex } from "../src/game/heroIdentity";

test("same hero has consistent original portrait, unique display name and level in HUD and 3D", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async () => (await inspect()).visitors.every(v => v.portraitReady)).toBe(true);
  const state = createGameState();
  const names = heroDisplayNames(state.adventurers);
  for (const visitor of (await inspect()).visitors) {
    const hero = state.adventurers.find(h => h.id === visitor.id)!;
    expect(visitor.displayName).toBe(names.get(hero.id));
    expect(visitor.portraitIndex).toBe(heroPortraitIndex(hero.id));
    expect(visitor.level).toBe(hero.level);
  }
  await page.keyboard.press("r");
  for (const hero of state.adventurers.filter(h => h.status === "at-shop")) {
    const card = page.locator('#roster-detail-list .roster-card[data-hero-id="' + hero.id + '"]');
    await expect(card.locator("strong")).toContainText(names.get(hero.id)!);
    await expect(card.locator("strong")).toContainText("Lv " + hero.level);
    await expect(card.locator(".roster-portrait")).toHaveAttribute("data-portrait-id", String(heroPortraitIndex(hero.id)));
  }
  await page.locator("#close-roster").click();
  await page.reload();
  await expect.poll(async () => (await inspect()).visitors.every(v => v.portraitReady)).toBe(true);
  for (const v of (await inspect()).visitors) {
    expect(v.portraitIndex).toBe(heroPortraitIndex(v.id));
    expect(v.displayName).toBe(names.get(v.id));
  }
  expect(errors).toEqual([]);
});
