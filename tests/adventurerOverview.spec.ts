import { expect, test } from "@playwright/test";

test("adventurer overview prioritizes navigation and can reveal detailed roster", async ({ page }) => {
  await page.goto("./");
  const toggle = page.locator("#toggle-adventurer-details");
  const details = page.locator("#adventurer-details");
  await expect(page.locator("#population-summary")).toBeVisible();
  await expect(page.locator("#shop-visitors")).toBeVisible();
  await expect(page.locator("#open-roster")).toBeVisible();
  await expect(page.locator("#open-arena")).toBeVisible();
  await expect(page.locator("#open-dungeon")).toBeVisible();
  await expect(details).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(page.locator("#adventurer-roster")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(details).toBeHidden();
});
