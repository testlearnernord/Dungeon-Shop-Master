import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";
import type { GameState } from "../src/game/gameState";
import { currentDayReceipts } from "../src/game/saleView";

test("manual checkout receipts are real and bedtime cannot sell stock by itself", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#sales-banner")).toContainText("No sales today.");
  await expect(page.locator("#sales-receipts")).toContainText("No purchases on this day.");

  // Seed a transaction through the SAME pure cashier commit used by the
  // running GameStore. Physically placing stock is not a sale.
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const {quoteCustomerCheckout,checkoutCustomer}=await import("/Dungeon-Shop-Master/src/game/customerCheckout.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const base=withStockedSmallShelf(createGameState(7351));
    const buyer=base.adventurers.find(hero=>hero.status==="at-shop");
    if(!buyer)throw new Error("No physically present shopper in seed.");
    const ready={...base,adventurers:base.adventurers.map(hero=>hero.id===buyer.id
      ?{...hero,gold:100,inventory:{...hero.inventory,bread:0,healing:0},
        equipment:{weapon:null,armor:null}}:hero)};
    const quote=quoteCustomerCheckout(ready,buyer.id);
    if(!quote)throw new Error("No valid physical sale to verify.");
    const paid=checkoutCustomer(ready,quote);
    if(paid.state===ready)throw new Error(paid.message);
    await new CampaignStorage().saveGame(paid.state);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");

  const state=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  }) as GameState;
  const receipts=currentDayReceipts(state);
  expect(receipts.length).toBeGreaterThan(0);
  await expect(page.locator("#sales-banner")).toContainText(
    state.shopEconomy.dailySales.units+" items sold · +"+state.shopEconomy.dailySales.revenue+"g");
  await expect(page.locator("#merchant-gold")).toHaveText(
    "Merchant gold: "+state.shopEconomy.balance+"g");
  await page.locator(".shop-management-details").evaluate((el:HTMLDetailsElement)=>{el.open=true;});
  await page.locator("#sales-ledger-summary").click();
  await expect(page.locator(".sales-receipt")).toHaveCount(receipts.length);
  for(const receipt of receipts){
    const row=page.locator('#sales-receipts li[data-event-id="'+receipt.id+'"]');
    await expect(row).toContainText(receipt.heroName);
    await expect(row).toContainText(receipt.itemName);
    await expect(row).toContainText("+"+receipt.revenue+"g");
    await expect(row.locator(".sales-item-icon")).toHaveCount(1);
  }

  // Deliberate bed interaction closes the DAY, not an automatic till.
  // Paid receipts survive as history but no second checkout is invented.
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#sales-banner")).toContainText("No sales today.");
  await expect(page.locator("#merchant-gold")).toHaveText(
    "Merchant gold: "+state.shopEconomy.balance+"g");
  const after=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(after?.events.filter(e=>e.type==="sale")).toEqual(
    state.events.filter(e=>e.type==="sale"));
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#sales-banner")).toContainText("No sales today.");
  const restored=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(restored?.events.filter(e=>e.type==="sale")).toEqual(
    state.events.filter(e=>e.type==="sale"));
  expect(errors).toEqual([]);
});
