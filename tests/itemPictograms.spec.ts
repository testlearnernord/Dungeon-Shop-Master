import { expect, test } from "@playwright/test";

test("hotbar renders distinct item pictograms with accessible labels", async ({ page }) => {
  await page.goto("./");
  await page.keyboard.press("Tab");
  const bag=page.locator("#inventory-dialog");
  await expect(bag.locator("[data-bag-item]")).toHaveCount(3);
  for(const id of ["healing-herb","mana-potion","bread"]){
    await expect(bag.locator('[data-bag-item="'+id+'"] svg use')).toHaveAttribute("href",
      new RegExp("assets/ui-item-icons\\.svg#"+id+"$"));
  }
  await page.keyboard.press("Tab");
  const rosterIcon=page.locator("#roster-dialog .hero-card-item-art").first();
  await page.locator("#open-roster").click();
  await page.locator("#roster-detail-list .roster-card").first().locator("summary").click();
  await expect(rosterIcon.locator("use")).toHaveAttribute("href",/ui-item-icons\.svg#/);
  const asset = await page.request.get("./assets/ui-item-icons.svg");
  expect(asset.ok()).toBeTruthy();
  expect(await asset.text()).toContain('id="iron-sword"');
});
