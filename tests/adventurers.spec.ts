import { expect, test } from "@playwright/test";
import { advanceDay, createGameState } from "../src/game/gameState";

test("read-only roster and textual visitors track the persistent simulation on confirmed days", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const roster = page.locator("#adventurer-roster li");
  const visitors = page.locator("#shop-visitors");
  await expect(roster).toHaveCount(10);
  await expect(page.locator("#population-summary")).toHaveText("Adventurers: 10 active · 0 lost");
  await expect(page.locator('#adventurer-roster li[data-status="at-shop"]')).toHaveCount(3);
  await expect(visitors).toContainText("Shop visitors (3):");
  await expect(page.locator("#adventurer-roster button, #adventurer-roster input")).toHaveCount(0);
  const initialRows = await roster.allTextContents();
  const inventory = await page.locator("#inventory").innerText();

  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(roster).toHaveText(initialRows);
  await page.waitForTimeout(500);
  await expect(page.locator("#day")).toHaveText("Day 1");

  let state = createGameState();
  for (let nextDay = 2; nextDay <= 12; nextDay += 1) {
    await page.keyboard.press("n");
    await page.keyboard.press("y");
    state = advanceDay(state).state;
    await expect(page.locator("#day")).toHaveText(`Day ${nextDay}`);
    const active = state.adventurers.filter((hero) => hero.status !== "dead");
    await expect(roster).toHaveCount(active.length);
    for (const hero of active) {
      await expect(page.locator(`[data-adventurer-id="${hero.id}"]`)).toHaveText(
        `${hero.name} · ${hero.role} · Lv ${hero.level} · HP ${hero.health}/${hero.stats.maxHealth} · F${hero.floor} ${hero.status}`,
      );
    }
    const atShop = active.filter((hero) => hero.status === "at-shop");
    await expect(visitors).toHaveText(
      `Shop visitors (${atShop.length}): ${atShop.map((hero) => hero.name).join(", ") || "none"}`,
    );
  }
  await expect(page.locator("#inventory")).toHaveText(inventory, { useInnerText: true });
  await page.locator("#population-summary").click();
  await expect(page.locator("#adventurer-roster")).toBeHidden();
  const frame = await page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).aimAtShelfSlot();
  });
  await expect.poll(() => page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).inspectPlayer().frame;
  })).toBeGreaterThan(frame + 2);
  await page.locator("#renderCanvas").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  await expect(page.locator("#status")).toContainText("Placed");
  const stocked = await page.locator("#inventory").innerText();
  expect(stocked).not.toBe(inventory);
  await page.keyboard.press("n");
  await page.keyboard.press("y");
  await expect(page.locator("#day")).toHaveText("Day 13");
  await expect(page.locator("#inventory")).toHaveText(stocked, { useInnerText: true });
  await page.mouse.click(400, 300, { button: "right" });
  await expect(page.locator("#status")).toContainText("Returned");
  await expect(page.locator("#inventory")).toHaveText(inventory, { useInnerText: true });
  expect(errors).toEqual([]);
});
