import { expect, test } from "@playwright/test";

test("adventurer wall board opens by R and nearby E, tracks state and persists permits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#adventurer-roster-board")).toHaveCount(0);
  await page.keyboard.press("r");
  const dialog = page.locator("#roster-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#roster-totals")).toContainText("10 active");
  await expect(page.locator("#roster-detail-list .roster-card")).toHaveCount(10);
  const first = page.locator('#roster-detail-list .roster-card[data-hero-id="adventurer-1"]');
  await first.locator("summary").click();
  await expect(first.locator(".roster-card-extended")).toBeVisible();
  await expect(first.locator(".roster-hp")).toHaveAttribute("aria-valuenow", /\d+/);
  await expect(first.locator(".roster-item-icon")).toHaveCount(5);
  await expect(first.locator(".roster-item-chip")).toContainText([
    "No weapon", "No armor", "Food", "Healing supplies", "Loot",
  ]);
  await expect(first.locator(".roster-portrait")).toHaveAttribute("data-portrait-id", "0");
  await first.locator(".roster-permit").click();
  await expect(first.locator(".roster-permit")).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator(".roster-permit")).toBeFocused();
  await page.keyboard.press("b");
  await expect(page.locator("#wholesale")).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.locator("#close-roster").click();
  await page.reload();
  await expect(page.locator("#roster-dialog")).toBeHidden();
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-dialog")).toBeVisible();
  const restored = page.locator('#roster-detail-list .roster-card[data-hero-id="adventurer-1"]');
  await restored.locator("summary").click();
  await expect(restored.locator(".roster-permit")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#roster-filter").selectOption("fallen");
  await expect(page.locator("#roster-detail-list")).toContainText("No fallen adventurers yet.");
  await page.locator("#close-roster").click();

  await page.evaluate(async () => {
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtRosterBoard();
  });
  await page.keyboard.press("e");
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.locator("#close-roster").click();
  expect(errors).toEqual([]);
});
