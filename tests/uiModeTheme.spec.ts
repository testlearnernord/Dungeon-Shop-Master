import { expect, test } from "@playwright/test";

test("spectator and management surfaces inherit the same theme tokens", async ({ page }) => {
  await page.goto("./");
  const values = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const border = style.getPropertyValue("--ui-border").trim();
    const color = style.getPropertyValue("--ui-text").trim();
    return { border, color };
  });
  expect(values.border).toBe("rgba(199,165,105,.33)");
  expect(values.color).toBe("#f2eadd");
  for (const selector of [
    "#shelf-placement",
    "#arena-hud .arena-toolbar",
    "#arena-hud .arena-bottom",
    "#dungeon-hud .dungeon-toolbar",
    "#dungeon-hud .dungeon-minimap-panel",
    "#dungeon-hud .dungeon-bottom",
  ]) {
    const result = await page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, radius: style.borderTopLeftRadius };
    });
    expect(result.border, selector).toBe("rgba(199, 165, 105, 0.33)");
    expect(result.radius, selector).toBe("13px");
  }
});
