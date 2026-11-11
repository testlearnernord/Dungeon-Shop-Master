import { expect, test } from "@playwright/test";

test("shop status can collapse without losing live day state or actions", async ({ page }) => {
  await page.goto("./");
  const toggle = page.locator("#toggle-shop-status");
  const details = page.locator("#shop-status-content");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(details).toBeHidden();
  await toggle.click();
  await expect(details).toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#end-day")).toBeVisible();
  await expect(page.locator("#open-wholesale")).toBeVisible();
});
