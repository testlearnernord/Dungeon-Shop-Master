import {expect,test} from "@playwright/test";

/** Physical anvil E hit + existing real customer buyback + atomic forge +
 * strict campaign Save/Load. Genuine deterministic monster drops and actual
 * 60Hz gear effects have separate pure-runtime regressions. */
test("player buys real adventurer salvage then forges and persists T2 at physical cellar anvil @ci-smoke",
  async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  // Scene diagnostics bring extra Babylon modules into Vite's dev dependency
  // graph. Preload them BEFORE buying any hero goods: the one-time optimize
  // dependency scan can legitimately trigger a dev-only full-page reload.
  // Never let that reload interrupt the real buyback/crafting transaction.
  for(let attempt=0;attempt<3;attempt++){
    try{
      await page.evaluate(async()=>{
        const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
        return probe.shopSceneReady();
      });
      break;
    }catch(error){
      if(attempt===2)throw error;
      await page.waitForLoadState("domcontentloaded");
    }
  }
  const fixture=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=createGameState(7351),seller=state.adventurers[0];
    const seeded={...state,adventurers:state.adventurers.map(hero=>
      hero.id===seller.id?{...hero,status:"at-shop" as const,
        floor:"shop" as const,inventory:{...hero.inventory,
          finds:{"iron-ore":1,coal:1,"ghoul-leather":2}}}:hero)};
    await new CampaignStorage().saveGame(seeded);
    return {heroId:seller.id,shopGold:seeded.shopEconomy.balance,
      heroGold:seller.gold};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  const modal=page.locator("#hero-buyback-hud");
  await page.locator("#open-hero-offers").click();
  await expect(modal).toBeVisible();
  for(const [item,count] of [["Iron Ore",1],["Coal",1],
    ["Ghoul Leather",2]] as const){
    for(let i=0;i<count;i++){
      const offer=modal.locator(".hero-buyback-offer").filter({hasText:item});
      await expect(offer).toBeVisible();
      await offer.getByRole("button",{name:new RegExp("Buy one "+item)}).click();
    }
  }
  await expect(modal.locator(".hero-buyback-empty")).toBeVisible();
  const afterTrade=await page.evaluate(async()=>{
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    // Read the actual DOM's displayed gold and reserve. An unsaved ongoing
    // GameStore is never replaced by a standalone test-side simulation.
    const balance=document.querySelector(".hero-buyback-budget")?.textContent??"";
    return {balance,hasSaveApi:typeof GameStore==="function"&&
      typeof CampaignStorage==="function"};
  });
  expect(afterTrade.balance).toContain("Iron Ore 1");
  expect(afterTrade.balance).toContain("Coal 1");
  expect(afterTrade.hasSaveApi).toBe(true);
  await modal.getByRole("button",{name:/Close/}).click();
  await page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const forge=probe.inspectCellarForge();
    if(!forge.exists||!forge.pickable||!forge.collision||!forge.sameScene)
      throw Error("The real cellar anvil must exist and be physical");
    probe.aimAtCellarForge();
  });
  await page.keyboard.press("e");
  const forge=page.locator("#cellar-forge-dialog");
  await expect(forge).toBeVisible({timeout:10000});
  await expect(forge.locator(".forge-reserve")).toContainText("Iron Ore 1");
  await expect(forge.locator(".forge-reserve")).toContainText("Coal 1");
  await expect(forge.locator(".forge-reserve")).toContainText("Ghoul Leather 2");
  const spear=forge.locator(".forge-recipe").filter({hasText:"T2 Spear"});
  await spear.getByRole("button",{name:"Forge 1"}).click();
  await expect(forge.locator(".forge-result")).toContainText("Forged 1 T2 Spear");
  await expect(forge.locator(".forge-reserve")).toContainText("Iron Ore 0");
  await expect(forge.locator(".forge-reserve")).toContainText("Coal 0");
  await expect(spear.getByRole("button",{name:"Forge 1"})).toBeDisabled();
  const armor=forge.locator(".forge-recipe").filter({hasText:"T2 Ghoul Leather Vest"});
  await armor.getByRole("button",{name:"Forge 1"}).click();
  await expect(forge.locator(".forge-result"))
    .toContainText("Forged 1 T2 Ghoul Leather Vest");
  await expect(forge.locator(".forge-reserve")).toContainText("Ghoul Leather 0");
  await expect(armor.getByRole("button",{name:"Forge 1"})).toBeDisabled();
  await forge.getByRole("button",{name:/Close/}).click();
  await expect(page.locator('#inventory [data-item-id="forged-spear"]'))
    .toContainText("1");
  await expect(page.locator('#inventory [data-item-id="ghoul-leather-vest"]'))
    .toContainText("1");
  // T2 is an actual finished shelf-good but must never be wholesale stock.
  await page.locator("#open-wholesale").click();
  const catalog=page.locator("#wholesale-catalog");
  const forged=catalog.locator('.catalog-row[data-item-id="forged-spear"]');
  await expect(forged).toContainText("FORGE IN CELLAR");
  await expect(forged.getByRole("button",{name:/Buy 1/})).toBeDisabled();
  await page.locator("#close-wholesale").click();
  await page.evaluate(async()=>{
    const hooks=window as Window&{
      __shopTestSaveTrafficNow?:()=>Promise<unknown>
    };
    if(!hooks.__shopTestSaveTrafficNow)throw Error("Missing real save hook");
    await hooks.__shopTestSaveTrafficNow();
  });
  await page.reload();
  const persisted=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Saved forge gameplay vanished");
    return {
      gold:state.shopEconomy.balance,
      bag:{spear:state.shopEconomy.bag["forged-spear"],
        armor:state.shopEconomy.bag["ghoul-leather-vest"]},
      materials:state.shopEconomy.materialStorage,
      buybacks:state.events.filter(e=>e.type==="hero-buyback").length,
    };
  });
  expect(persisted.bag).toEqual({spear:1,armor:1});
  expect(persisted.materials).toEqual({
    "iron-ore":0,coal:0,"ghoul-leather":0});
  expect(persisted.buybacks).toBe(4);
  expect(persisted.gold).toBeLessThan(fixture.shopGold);
  expect(errors).toEqual([]);
});
