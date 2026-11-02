import { expect, test } from "@playwright/test";

test("Level 6 expedition ledger tracks a real authorized trip and survives reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#level6-progress-summary")).toContainText("0 victories / 0 fights");
  const visitor = page.locator('#adventurer-roster li[data-status="at-shop"]').first();
  await visitor.locator(".level6-permit").click();
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#level6-progress-counts")).toContainText("1 departures");
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 3");
  await expect(page.locator("#level6-progress-summary")).toContainText("1 fights");
  await page.locator("#level6-expedition-ledger summary").click();
  await expect(page.locator('#level6-expedition-events li[data-outcome]')).toHaveCount(1);
  const entry = page.locator('#level6-expedition-events li[data-outcome]').first();
  await expect(entry).toContainText((await entry.getAttribute("data-event-id"))!);
  const text = await page.locator("#level6-progress-counts").textContent();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 3.");
  await page.reload();
  await expect(page.locator("#level6-progress-counts")).toHaveText(text!);
  await page.locator("#level6-expedition-ledger summary").click();
  await expect(page.locator('#level6-expedition-events li[data-outcome]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
