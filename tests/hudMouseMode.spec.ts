import { expect, test } from "@playwright/test";

test("management reports can be opened by pointer without the HUD swallowing clicks", async ({ page }) => {
  await page.goto("./");
  const management = page.locator(".shop-management-details");
  await expect(page.locator("#shop-status-content")).toBeHidden();
  await page.locator("#toggle-shop-status").click();
  await expect(page.locator("#shop-status-content")).toBeVisible();
  await expect(management).not.toHaveAttribute("open", "");
  await management.locator(":scope > summary").click();
  await expect(management).toHaveAttribute("open", "");
  await expect(page.locator("#world-events")).toBeVisible();
  await management.locator(":scope > summary").click();
  await expect(management).not.toHaveAttribute("open", "");
});

test("M releases captured shop mouse for UI interaction", async ({ page }) => {
  await page.goto("./");
  await page.locator("#renderCanvas").click({ position: { x: 300, y: 300 } });
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.locator("#toggle-shop-status").click();
  await expect(page.locator("#shop-status-content")).toBeVisible();
  await page.locator(".shop-management-details > summary").click();
  await expect(page.locator(".shop-management-details")).toHaveAttribute("open", "");
});
