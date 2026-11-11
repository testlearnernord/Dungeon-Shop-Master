import { expect, test } from "@playwright/test";

test("keyboard legend starts compact and expands without hiding hotbar", async ({ page }) => {
  await page.goto("./");
  const legend = page.locator("details.controls");
  const shortcuts = legend.locator(".controls-keys");
  await expect(legend).not.toHaveAttribute("open", "");
  await expect(shortcuts).toBeHidden();
  await expect(page.locator("#inventory")).toBeVisible();
  await legend.locator("summary").click();
  await expect(legend).toHaveAttribute("open", "");
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).toContainText("WASD");
  await expect(page.locator("#inventory")).toBeVisible();
  await legend.locator("summary").click();
  await expect(shortcuts).toBeHidden();
});
