import {expect,test} from "@playwright/test";

test("Galvik reads real outstanding credit from the bedroom Book of Debts, not the roster",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const borrower=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {issueShopCredit}=await import("/Dungeon-Shop-Master/src/game/shopCredit.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const hero=initial.adventurers[0];
    const broke={...initial,adventurers:initial.adventurers.map(entry=>
      entry.id===hero.id?{...entry,gold:0,inventory:{...entry.inventory,bread:0}}:entry)};
    const loan=issueShopCredit(broke,hero.id);
    if(loan.state===broke)throw new Error("Fixture loan was not authorized");
    await new CampaignStorage().saveGame(loan.state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 1.");
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await expect(page.locator("#roster-totals")).not.toContainText("Credits outstanding");
  await expect(page.locator("#roster-dialog")).not.toContainText("GALVIK'S DEBT BOOK");
  await page.keyboard.press("Escape");
  await expect(page.locator("#roster-dialog")).toBeHidden();
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtDebtBook());
  await page.keyboard.press("e");
  const book=page.locator("#debt-book-dialog");
  await expect(book).toBeVisible();
  await expect(book.locator("#debt-book-totals")).toContainText("4g");
  await expect(book.locator("#debt-book-entries")).toContainText("4g");
  await expect(book.locator("#debt-book-entries summary")).toHaveCount(1);
  await book.locator("#debt-book-entries summary").click();
  await expect(book.locator("#debt-book-entries")).toContainText("Waybread");
  const state=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(state?.shopDebts.find(entry=>entry.heroId===borrower)?.outstandingGold).toBe(4);
  await book.locator("#debt-book-close").click();
  await expect(book).toBeHidden();
  expect(errors).toEqual([]);
});
