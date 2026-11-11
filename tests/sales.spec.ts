import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";
import { advanceDay, createGameState } from "../src/game/gameState";
import { currentDayReceipts } from "../src/game/saleView";

test("sales display matches booked gold, shelf stock and named 3D customers after End Day", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#sales-banner")).toContainText("No sales today.");
  await expect(page.locator("#sales-receipts")).toContainText("No purchases on this day.");

  const expected = advanceDay(createGameState()).state;
  const receipts = currentDayReceipts(expected);
  expect(receipts.length).toBeGreaterThan(0);
  await page.keyboard.press("n"); // The obsolete end-day shortcut must do nothing.
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#sales-banner")).toContainText("No sales today.");
  await advanceTestDay(page);

  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#sales-banner")).toContainText(
    expected.shopEconomy.dailySales.units + " items sold · +" + expected.shopEconomy.dailySales.revenue + "g");
  await expect(page.locator("#merchant-gold")).toHaveText(
    "Merchant gold: " + expected.shopEconomy.balance + "g");
  await expect(page.locator("#sales-ledger-summary")).toContainText(
    expected.shopEconomy.dailySales.units + " sold / +" + expected.shopEconomy.dailySales.revenue + "g");
  await page.locator(".shop-management-details").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.locator("#sales-ledger-summary").click();
  await expect(page.locator(".sales-receipt")).toHaveCount(receipts.length);
  for (const receipt of receipts) {
    // Receipt IDs link UI rows to authoritative event IDs (names need not be unique).
    const exact = page.locator('#sales-receipts li[data-event-id="' + receipt.id + '"]');
    await expect(exact).toContainText(receipt.heroName);
    await expect(exact).toContainText(receipt.itemName);
    await expect(exact).toContainText("+" + receipt.revenue + "g");
    await expect(exact.locator(".sales-item-icon")).toHaveCount(1);
   }

  const view = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const visible = await view();
  for (const heroId of new Set(receipts.map((receipt) => receipt.heroId))) {
    expect(visible.saleTags).toContain("npc-sale-" + heroId);
  }
  expect(visible.visitors.every(({ unpickable }) => unpickable)).toBe(true);
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.reload();
  await page.locator(".shop-management-details").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#sales-banner")).toContainText(
    expected.shopEconomy.dailySales.units + " items sold · +" + expected.shopEconomy.dailySales.revenue + "g");
  await page.locator("#sales-ledger-summary").click();
  await expect(page.locator(".sales-receipt")).toHaveCount(receipts.length);
  expect((await view()).saleTags).toEqual([]); // no phantom checkout after reload
  expect(errors).toEqual([]);
});
