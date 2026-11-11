import { expect, test } from "@playwright/test";

test("Level 6 passes are per-hero, autosaved, and never unlock the physical gate yet", async ({ page }) => {
  await page.goto("./");
  await page.locator("#toggle-adventurer-details").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const buttons = page.locator("#adventurer-roster .level6-permit");
  await expect(buttons).toHaveCount(3);
  const first = buttons.first();
  const id = await first.getAttribute("data-adventurer-id");
  await first.click();
  await expect(page.locator(`#adventurer-roster button[data-adventurer-id="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.reload();
  await page.locator("#toggle-adventurer-details").click();
  await expect(page.locator(`#adventurer-roster button[data-adventurer-id="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#shop-visitors")).toContainText("Shop visitors (3)");
  await page.locator(`#adventurer-roster button[data-adventurer-id="${id}"]`).click();
  await expect(page.locator(`#adventurer-roster button[data-adventurer-id="${id}"]`)).toHaveAttribute("aria-pressed", "false");
});