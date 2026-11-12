import { expect, test } from "@playwright/test";

/** Screenshots of real current game code, not artist mockups. */
test("capture Galvik's sleeping room and the merchant's day-end ledger", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const room=await page.evaluate(async()=>{
    return (await import("/Dungeon-Shop-Master/tests/scene.ts")).stageBedchamberCamera();
  });
  expect(room.bed&&room.chamber).toBe(true);
  await page.waitForTimeout(1250);
  await page.locator("#renderCanvas").screenshot({path:"screenshot-output/01-galviks-schlafkammer.png"});

  // Prepare a real, committed level-6 combat event in the authoritative
  // simulation, so the book displays a sealed WATCH entry.
  await page.evaluate(()=>{
    document.querySelector<HTMLButtonElement>(".level6-permit")!.click();
    const advance=(window as Window&{__shopTestAdvanceDay?:()=>void}).__shopTestAdvanceDay;
    if(!advance)throw new Error("test server is missing E2E simulation hook");
    advance();
  });
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectPlayer({x:-0.25,y:1.7,z:-10.3});
  });
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 3");
  await page.waitForTimeout(800);
  await page.screenshot({path:"screenshot-output/02-tagesabschluss-gesamt.png"});
  await page.locator("#ledger-chapters button").nth(1).click();
  await page.waitForTimeout(700);
  await page.screenshot({path:"screenshot-output/03-kassenbuch-verkaeufe.png"});
  await page.locator("#ledger-chapters button").nth(3).click();
  await expect(page.locator(".ledger-record")).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.screenshot({path:"screenshot-output/04-versiegelte-expedition.png"});

  await page.setViewportSize({width:430,height:932});
  await page.locator("#ledger-chapters button").nth(0).click();
  await page.waitForTimeout(700);
  await page.screenshot({path:"screenshot-output/05-kassenbuch-handyansicht.png"});
});