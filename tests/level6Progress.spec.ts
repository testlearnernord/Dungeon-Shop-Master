import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";

/** The old standalone Level-6 ledger is retired; genuine saved solo
 * recordings are still reachable in the shared, spoiler-safe archive. */
test("historic solo Troll footage survives reload in the one Expedition Archive",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await page.locator("#toggle-adventurer-details").click();
  const visitor=page.locator('#adventurer-roster li[data-status="at-shop"]').first();
  await visitor.locator(".boss-pass").click();
  await advanceTestDay(page);
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 3");
  await page.locator("#open-archive").click();
  const recorded=page.locator('#archive-entries article[data-kind="combat"]');
  await expect(recorded).toHaveCount(1);
  await expect(recorded.first()).toContainText("Recorded expedition");
  const eventId=await recorded.first().getAttribute("data-event-id");
  expect(eventId).toMatch(/level6-combat/);
  await expect(recorded.first().locator("button",{hasText:"Watch recording"})).toBeVisible();
  await page.locator("#archive-close").click();
  await page.reload();
  await page.locator("#open-archive").click();
  await expect(page.locator('#archive-entries article[data-event-id="'+eventId+'"]')).toHaveCount(1);
  await expect(page.locator("#level6-expedition-ledger")).toHaveCount(0);
  expect(errors).toEqual([]);
});
