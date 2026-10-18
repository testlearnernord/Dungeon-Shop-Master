import { expect, test } from "@playwright/test";
import { ITEMS } from "../src/game/economy";

test("wholesale, stocking and confirmed sales share stock and gold without modal input leaking", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#merchant-gold")).toHaveText("Merchant gold: 20g");
  await page.locator("#renderCanvas").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  await page.keyboard.press("b");
  await expect(page.locator("#wholesale")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  const buy = page.getByRole("button", { name: "Buy 1 Waybread", exact: true });
  await buy.dblclick();
  const bread = ITEMS.find((item) => item.id === "bread")!;
  await expect(page.locator("#merchant-gold")).toHaveText(`Merchant gold: ${20 - bread.wholesaleCost}g`);
  await expect(page.locator("#wholesale-message")).toContainText("Bought 1 Waybread");
  await expect(page.locator(".inventory-row").filter({ hasText: "Waybread" }).locator("strong")).toHaveText("3");
  // Holding a native activation key must not place repeat orders.
  await buy.focus();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(page.locator("#merchant-gold")).toHaveText(`Merchant gold: ${20 - 2 * bread.wholesaleCost}g`);
  await page.keyboard.press("n");
  await page.keyboard.press("y");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.keyboard.press("Escape");
  await expect(page.locator("#wholesale")).toBeHidden();

  await page.locator("#population-summary").click();
  const frame = await page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).aimAtShelfSlot();
  });
  await expect.poll(() => page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).inspectPlayer().frame;
  })).toBeGreaterThan(frame + 2);
  // Select bread without moving the camera or stocking a different item.
  await page.locator("#renderCanvas").dispatchEvent("wheel", { deltaY: -1 });
  await page.locator("#renderCanvas").click();
  await expect(page.locator("#status")).toContainText("Placed Waybread");
  await expect(page.locator("#shelf-supplies")).toContainText("Waybread 4");
  const balanceBeforeSale = 20 - 2 * bread.wholesaleCost;
  await page.keyboard.press("n");
  await expect(page.locator("#merchant-gold")).toHaveText(`Merchant gold: ${balanceBeforeSale}g`);
  await page.keyboard.press("y");
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#daily-sales")).toHaveText(`Last End Day: 4 sold · earned ${4 * bread.salePrice}g`);
  await expect(page.locator("#merchant-gold")).toHaveText(`Merchant gold: ${balanceBeforeSale + 4 * bread.salePrice}g`);
  await expect(page.locator("#shelf-supplies")).toContainText("Waybread 0");
  await page.evaluate(() => document.exitPointerLock());
  await page.getByText("Full day report", { exact: true }).click();
  await expect(page.locator("#day-history")).toContainText("bought");
  await expect(page.locator("#day-history")).toContainText("ate");

  // Restock after a complete sell-out, at a smaller laptop viewport too.
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.getByRole("button", { name: "Wholesale (B)", exact: true }).click();
  await buy.click();
  await expect(page.locator("#wholesale-message")).toContainText("Bought 1 Waybread");
  await expect(page.locator("#wholesale")).toBeInViewport();
  await page.getByRole("button", { name: "Close catalog (Esc / B)", exact: true }).click();
  expect(errors).toEqual([]);
});
