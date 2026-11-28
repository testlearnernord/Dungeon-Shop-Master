import {expect,test} from "@playwright/test";

test("returning adventurer sells materials, accepts one manual gear offer and declines the next, with saved receipts @ci-smoke",
  async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const fixture=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const base=createGameState(7351),seller=base.adventurers[0];
    const state={...base,adventurers:base.adventurers.map(hero=>hero.id!==seller.id
      ?hero:{...hero,status:"at-shop" as const,floor:"shop" as const,
        health:hero.stats.maxHealth,
        inventory:{...hero.inventory,finds:{"iron-ore":2,"iron-sword":1,"leather-vest":1}}})};
    await new CampaignStorage().saveGame(state);
    return {heroId:seller.id,startingGold:seller.gold,
      shopGold:state.shopEconomy.balance,
      reserveOre:state.shopEconomy.materialStorage["iron-ore"],
      bagSword:state.shopEconomy.bag["iron-sword"],bagVest:state.shopEconomy.bag["leather-vest"]};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText(/Continued saved Day 1\./);
  await expect(page.locator("#inventory .inventory-row")).toHaveCount(6);
  await expect(page.locator('#inventory [data-item-id="iron-ore"]')).toHaveCount(0);
  await expect(page.locator('#inventory [data-item-id="coal"]')).toHaveCount(0);
  await page.evaluate(async()=>{
    const {aimAtBuybackDock}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    aimAtBuybackDock();
    (window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld?.(false);
  });
  await expect(page.locator("#open-buyback-log")).toHaveAttribute("data-receipts","2",{timeout:120000});
  const offer=page.locator("#npc-used-gear-offer");
  await expect(offer).toBeVisible({timeout:15000});
  await expect(offer).toContainText("T1 Sword & Shield");
  await expect(page.locator("#open-buyback-log")).toHaveAttribute("data-receipts","2");
  await offer.getByRole("button",{name:"Accept (Y)",exact:true}).click();
  await expect(page.locator("#open-buyback-log")).toHaveAttribute("data-receipts","3");
  await expect(offer).toContainText("T1 Leather Vest");
  await offer.getByRole("button",{name:"Decline (N)",exact:true}).click();
  await expect(offer).toBeHidden();
  await page.evaluate(()=>{(window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld?.(true);});
  await page.locator("#open-buyback-log").click();
  const modal=page.locator("#hero-buyback-hud");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".hero-buyback-budget")).toContainText("Iron Ore 2");
  await expect(modal.locator(".buyback-receipt")).toHaveCount(3);
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
      merchantOre:state.shopEconomy.materialStorage["iron-ore"],
      bagOre:state.shopEconomy.bag["iron-ore"],
      bagSword:state.shopEconomy.bag["iron-sword"],bagVest:state.shopEconomy.bag["leather-vest"],
      heroSword:state.adventurers[0].inventory.finds?.["iron-sword"],
      heroVest:state.adventurers[0].inventory.finds?.["leather-vest"],
      heroGold:state.adventurers.find(h=>h.id===(state.adventurers[0].id))!.gold,
      heroOre:state.adventurers[0].inventory.finds?.["iron-ore"],
      receipts:state.events.filter(e=>e.type==="hero-buyback"),
    };
  });
  expect(stored.merchantGold).toBe(fixture.shopGold-8);
  expect(stored.merchantOre).toBe(fixture.reserveOre+2);
  expect(stored.bagOre).toBe(0);
  expect(stored.heroGold).toBe(fixture.startingGold+8);
  expect(stored.bagSword).toBe(fixture.bagSword+1);
  expect(stored.bagVest).toBe(fixture.bagVest);
  expect(stored.heroSword).toBeUndefined();
  expect(stored.heroVest).toBe(1);
  expect(stored.heroOre).toBeUndefined();
  expect(stored.receipts).toHaveLength(3);
  expect(stored.receipts[2]).toMatchObject({adventurerId:fixture.heroId,itemId:"iron-sword",quantity:1,cost:4});
  expect(stored.receipts[0]).toMatchObject({
    adventurerId:fixture.heroId,itemId:"iron-ore",quantity:1,cost:2,
  });
  expect(errors).toEqual([]);
});
