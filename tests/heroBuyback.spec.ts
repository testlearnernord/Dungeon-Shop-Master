import {expect,test} from "@playwright/test";

test("returning adventurer sells one real find to Galvik, saved with a paid expense receipt @ci-smoke",
  async({page})=>{
  test.setTimeout(70000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const fixture=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const base=createGameState(7351),seller=base.adventurers[0];
    const state={...base,adventurers:base.adventurers.map(hero=>hero.id!==seller.id
      ?hero:{...hero,status:"at-shop" as const,floor:5 as const,
        health:hero.stats.maxHealth,
        inventory:{...hero.inventory,finds:{"iron-ore":2}}})};
    await new CampaignStorage().saveGame(state);
    return {heroId:seller.id,startingGold:seller.gold,
      shopGold:state.shopEconomy.balance,
      bagOre:state.shopEconomy.bag["iron-ore"]};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const trigger=page.locator("#open-hero-offers");
  await expect(trigger).toContainText("Hero loot");
  await trigger.click();
  const modal=page.locator("#hero-buyback-hud");
  await expect(modal).toBeVisible();
  const offer=modal.locator(".hero-buyback-offer").filter({hasText:"Iron Ore"});
  await expect(offer).toContainText("×2");
  await offer.getByRole("button",{name:/Buy one Iron Ore/}).click();
  await expect(offer).toContainText("×1");
  await expect(modal.locator(".hero-buyback-feedback")).toContainText("bought 1 Iron Ore");
  await page.evaluate(async()=>{
    const hooks=window as Window&{
      __shopTestSaveTrafficNow?:()=>Promise<unknown>
    };
    if(!hooks.__shopTestSaveTrafficNow)
      throw new Error("Missing genuine campaign persistence hook");
    await hooks.__shopTestSaveTrafficNow();
  });
  const stored=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw new Error("The real campaign was not saved");
    return {
      merchantGold:state.shopEconomy.balance,
      merchantOre:state.shopEconomy.bag["iron-ore"],
      heroGold:state.adventurers.find(h=>h.id===(state.adventurers[0].id))!.gold,
      heroOre:state.adventurers[0].inventory.finds?.["iron-ore"],
      receipts:state.events.filter(e=>e.type==="hero-buyback"),
    };
  });
  expect(stored.merchantGold).toBe(fixture.shopGold-2);
  expect(stored.merchantOre).toBe(fixture.bagOre+1);
  expect(stored.heroGold).toBe(fixture.startingGold+2);
  expect(stored.heroOre).toBe(1);
  expect(stored.receipts).toHaveLength(1);
  expect(stored.receipts[0]).toMatchObject({
    adventurerId:fixture.heroId,itemId:"iron-ore",quantity:1,cost:2,
  });
  expect(errors).toEqual([]);
});
