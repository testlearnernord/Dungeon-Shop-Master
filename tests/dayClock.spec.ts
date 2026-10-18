import { expect, test } from "@playwright/test";

test("day confirmation guards clicks and keyboard repeats without blocking the shop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const day = page.locator("#day");
  const confirmation = page.locator("#day-confirmation");
  await expect(day).toHaveText("Day 1");
  await expect(page.locator("#world-events")).toContainText("Welcome to Day 1");
  const inventory = await page.locator("#inventory").innerText();

  await page.getByRole("button", { name: "End Day (N)", exact: true }).dblclick();
  await expect(confirmation).toBeVisible();
  await expect(day).toHaveText("Day 1");
  await page.getByRole("button", { name: "Cancel (Esc)", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await page.getByRole("button", { name: "End Day (N)", exact: true }).click();
  // Dispatch both click events even though the first hides the confirmation.
  await page.locator("#confirm-day").evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(day).toHaveText("Day 2");
  await expect(confirmation).toBeHidden();

  await page.locator("#renderCanvas").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  await page.keyboard.press("y");
  await expect(day).toHaveText("Day 2");
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(day).toHaveText("Day 2");
  await page.keyboard.down("n");
  await page.keyboard.down("n");
  await page.keyboard.down("y");
  await page.keyboard.down("y");
  await expect(day).toHaveText("Day 3");
  // A held confirm key must not confirm a newly requested day.
  await page.keyboard.up("n");
  await page.keyboard.down("n");
  await page.keyboard.down("y");
  await expect(day).toHaveText("Day 3");
  await page.keyboard.up("y");
  await page.keyboard.up("n");
  await page.keyboard.press("y");
  await expect(day).toHaveText("Day 4");

  for (let nextDay = 5; nextDay <= 11; nextDay += 1) {
    await page.keyboard.press("n");
    await page.keyboard.press("y");
    await expect(day).toHaveText(`Day ${nextDay}`);
  }
  await expect(page.locator("#world-events li")).toHaveCount(3);
  const eventIds = await page.locator("#world-events li").evaluateAll((entries) =>
    entries.map((entry) => (entry as HTMLElement).dataset.eventId));
  expect(eventIds.every((id) => id?.startsWith("day-11:"))).toBe(true);
  expect(new Set(eventIds).size).toBe(3);
  await expect(page.locator("#inventory")).toHaveText(inventory, { useInnerText: true });

  // Reacquire if Escape released pointer lock, then move while a request is pending.
  await page.evaluate(() => document.exitPointerLock());
  await page.locator("#renderCanvas").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  const inspect = () => page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).inspectPlayer();
  });
  const start = await inspect();
  await page.keyboard.press("n");
  await page.keyboard.down("w");
  await page.waitForTimeout(1000);
  await page.keyboard.up("w");
  const end = await inspect();
  expect(end.z - start.z).toBeGreaterThan(0.1);
  expect(end.frame).toBeGreaterThan(start.frame + 5);
  await expect(day).toHaveText("Day 11");
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("y");
  await expect(day).toHaveText("Day 12");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");
  expect(errors).toEqual([]);
});
