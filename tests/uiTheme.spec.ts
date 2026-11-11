import { expect, test } from "@playwright/test";

test("shop hotbar and management dialogs share interface theme", async ({ page }) => {
  await page.goto("./");
  const theme = await page.locator("#inventory").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { border: styles.borderTopColor, background: styles.backgroundColor };
  });
  expect(theme.border).toBe("rgba(192, 153, 96, 0.48)");
  expect(theme.background).toBe("rgba(15, 18, 19, 0.92)");
  await page.locator("#open-wholesale").click();
  await expect(page.locator("#wholesale")).toBeVisible();
  const catalogBorder = await page.locator("#wholesale").evaluate(
    (element) => getComputedStyle(element).borderTopColor);
  expect(catalogBorder).toBe(theme.border);
});
