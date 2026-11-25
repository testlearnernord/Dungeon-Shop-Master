import {expect,test} from "@playwright/test";
import {mkdir} from "node:fs/promises";

test("Capture actual adventurer board and roster on the PR candidate",async({page})=>{
  await mkdir("board-screenshots",{recursive:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtRosterBoard();
  });
  await page.waitForTimeout(1800);
  await page.screenshot({path:"board-screenshots/01-wall-board.png"});
  await page.keyboard.press("e");
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await expect(page.locator("#roster-detail-list .roster-card")).toHaveCount(10);
  await page.screenshot({path:"board-screenshots/02-roster.png"});
  await page.locator("#roster-detail-list .roster-card").first().locator("summary").click();
  await expect(page.locator("#roster-detail-list .roster-card[open]")).toBeVisible();
  await page.screenshot({path:"board-screenshots/03-expanded-hero.png"});
});
