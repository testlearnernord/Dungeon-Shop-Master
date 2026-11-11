import { expect, test } from "@playwright/test";

test("hotbar renders distinct item pictograms with accessible labels", async ({ page }) => {
  await page.goto("./");
  const rows = page.locator("#inventory .inventory-row");
  await expect(rows).toHaveCount(6);
  const ids = ["healing-herb", "mana-potion", "iron-ore", "bread", "iron-sword", "leather-vest"];
  for (const id of ids) {
    const row = page.locator(`#inventory .inventory-row[data-item-id="${id}"]`);
    await expect(row).toHaveAttribute("aria-label", /Select .+ available/);
    const icon = row.locator("svg.item-pictogram use");
    await expect(icon).toHaveAttribute("href", new RegExp(`assets/ui-item-icons\\.svg#${id}$`));
  }
  const asset = await page.request.get("./assets/ui-item-icons.svg");
  expect(asset.ok()).toBeTruthy();
  expect(await asset.text()).toContain('id="iron-sword"');
});
