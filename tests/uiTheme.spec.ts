import { expect, test } from "@playwright/test";

test("shop hotbar and management dialogs share interface theme", async ({ page }) => {
  await page.goto("./");
  const theme = await page.locator("#inventory").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { border: styles.borderTopWidth, background: styles.backgroundColor };
  });
  expect(theme.border).toBe("0px");
  expect(theme.background).toBe("rgba(0, 0, 0, 0)");
  await page.locator("#open-wholesale").click();
  await expect(page.locator("#wholesale")).toBeVisible();
  const catalogBorder = await page.locator("#wholesale").evaluate(
    (element) => getComputedStyle(element).borderTopColor);
  expect(catalogBorder).not.toBe(theme.border);
});
