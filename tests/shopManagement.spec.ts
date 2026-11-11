import { expect, test } from "@playwright/test";

test("shop management keeps daily actions visible and reports optional", async ({ page }) => {
  await page.goto("./");
  const management = page.locator(".shop-management-details");
  await expect(page.locator("#day")).toBeVisible();
  await expect(page.locator("#merchant-gold")).toBeVisible();
  await expect(page.locator("#open-wholesale")).toBeVisible();
  await expect(page.locator("#open-placement")).toBeVisible();
  await expect(page.locator(".bedtime-tip")).toBeVisible();
  await expect(management).not.toHaveAttribute("open", "");
  await expect(page.locator("#world-events")).toBeHidden();
  await management.locator(":scope > summary").click();
  await expect(page.locator("#world-events")).toBeVisible();
  await expect(page.locator("#sales-ledger")).toBeVisible();
  await expect(page.locator("#level6-expedition-ledger")).toBeVisible();
  await expect(page.locator(".campaign-panel")).toBeVisible();
  await expect(page.locator(".bedtime-tip")).toBeVisible();
});
