import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";

async function moveToBed(page:import("@playwright/test").Page){
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectPlayer({x:-0.25,y:1.7,z:-10.3});
  });
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
}

test("Galvik closes a day by holding E at his bed, then reads the ledger",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#end-day")).toHaveCount(0);
  await expect(page.locator("#day-confirmation")).toHaveCount(0);
  await page.keyboard.press("n");
  await page.keyboard.press("z");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const bedroom=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBedroom());
  expect(bedroom).toEqual({exists:true,collides:true,rearWall:true,oldWall:false});
  await moveToBed(page);
  await page.keyboard.down("e");
  await page.waitForTimeout(350);
  await expect.poll(async()=>Number(await page.locator("#sleep-progress-track").getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  await page.keyboard.up("e");
  await expect.poll(async()=>Number(await page.locator("#sleep-progress-track").getAttribute("aria-valuenow"))).toBe(0);
  await page.waitForTimeout(250);
  await expect(page.locator("#day")).toHaveText("Day 1");

  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#ledger-heading")).toHaveText("The Reckoning");
  await expect(page.locator("#ledger-page-content")).toContainText("GOLD AT DAWN");
  const day2=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.day;
  });
  expect(day2).toBe(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("Goods & Receipts");
  await expect(page.locator("#ledger-page-content")).toContainText("SALES BY GOOD");
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("The Living");
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("Sealed Expeditions");
  // A reload must reopen the still-unread ledger, not advance another day.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.reload();
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.locator("#ledger-begin").click();
  await expect(page.locator("#merchant-ledger")).not.toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 2");
  // Repeated key taps cannot advance the day without another full bed hold.
  await page.keyboard.press("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

test("book keeps expedition results sealed until the observer watches a replay",async({page})=>{
  await page.goto("./");
  await page.locator("#adventurer-roster .level6-permit").first()
    .evaluate((button:HTMLButtonElement)=>button.click());
  await advanceTestDay(page); // Level 6 departure on day 2
  await expect(page.locator("#day")).toHaveText("Day 2");
  await moveToBed(page);
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await page.locator('#ledger-chapters button').last().click();
  const recording=page.locator(".ledger-record").first();
  await expect(recording).toBeVisible();
  await expect(recording).toContainText("SEALED RECORD");
  await expect(recording).not.toContainText(/victory|death|defeat/i);
  await recording.locator(".ledger-watch").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await expect(page.locator("#merchant-ledger")).not.toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await page.locator("#ledger-begin").click();
  await expect(page.locator("#day")).toHaveText("Day 3");
});
