import { expect, test } from "@playwright/test";
import { ITEMS } from "../src/game/economy";

test("equipment appears in wholesale, can be bought, and autosaves its stock", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-wholesale").click();
  const sword = ITEMS.find(x=>x.id==="iron-sword")!;
  const vest = ITEMS.find(x=>x.id==="leather-vest")!;
  await expect(page.getByRole("button",{name:"Buy 1 Iron Sword"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Buy 1 Leather Vest"})).toBeVisible();
  await page.getByRole("button",{name:"Buy 1 Iron Sword"}).click();
  await page.getByRole("button",{name:"Buy 1 Leather Vest"}).click();
  await expect(page.locator("#merchant-gold")).toHaveText("Merchant gold: "+(20-sword.wholesaleCost-vest.wholesaleCost)+"g");
  await expect(page.locator(".inventory-row").filter({hasText:"Iron Sword"}).locator("strong")).toHaveText("1");
  await expect(page.locator(".inventory-row").filter({hasText:"Leather Vest"}).locator("strong")).toHaveText("1");
  await page.locator("#close-wholesale").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator(".inventory-row").filter({hasText:"Iron Sword"}).locator("strong")).toHaveText("1");
  await expect(page.locator(".inventory-row").filter({hasText:"Leather Vest"}).locator("strong")).toHaveText("1");
  expect(errors).toEqual([]);
});
