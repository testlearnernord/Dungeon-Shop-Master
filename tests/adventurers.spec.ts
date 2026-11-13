import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";
import { advanceDay, createGameState } from "../src/game/gameState";
import { heroDisplayNames } from "../src/game/heroIdentity";

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
  // Roster stats remain read-only; only visiting heroes may receive Level 6 permissions.
  await expect(page.locator("#adventurer-roster .level6-permit")).toHaveCount(3);
  await expect(page.locator("#adventurer-roster button:not(.level6-permit), #adventurer-roster input")).toHaveCount(0);
  const initialRows = await roster.allTextContents();
  const inventory = await page.locator("#inventory").innerText();

  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(roster).toHaveText(initialRows);
  await page.waitForTimeout(500);
  await expect(page.locator("#day")).toHaveText("Day 1");

  let state = createGameState();
  for (let nextDay = 2; nextDay <= 12; nextDay += 1) {
    await advanceTestDay(page);
    state = advanceDay(state).state;
    await expect(page.locator("#day")).toHaveText(`Day ${nextDay}`);
    const names = heroDisplayNames(state.adventurers);
    const active = state.adventurers.filter((hero) => hero.status !== "dead");
    await expect(roster).toHaveCount(active.length);
    for (const hero of active) {
      await expect(page.locator(`#adventurer-roster li[data-adventurer-id="${hero.id}"] .hero-summary`)).toHaveText(
        `${names.get(hero.id) ?? hero.name} · ${hero.role} · Lv ${hero.level} · HP ${hero.health}/${hero.stats.maxHealth} · F${hero.floor} ${hero.status} · Waybread ${hero.inventory.bread} · Herbs ${hero.inventory.healing}`,
      );
    }
    const atShop = active.filter((hero) => hero.status === "at-shop");
    await expect(page.locator("#adventurer-roster .level6-permit")).toHaveCount(atShop.length);
    await expect(visitors).toHaveText(
      `Shop visitors (${atShop.length}): ${atShop.map((hero) => names.get(hero.id) ?? hero.name).join(", ") || "none"}`,
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
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 13");
  await expect(page.locator("#inventory")).toHaveText(stocked, { useInnerText: true });
  await page.mouse.click(400, 300, { button: "right" });
  await expect(page.locator("#status")).toContainText("Returned");
  await expect(page.locator("#inventory")).toHaveText(inventory, { useInnerText: true });
  expect(errors).toEqual([]);
});
