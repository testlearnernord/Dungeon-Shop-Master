import {expect,test} from "@playwright/test";

/** Physical anvil E hit + existing real customer buyback + atomic forge +
 * strict campaign Save/Load. Genuine deterministic monster drops and actual
 * 60Hz gear effects have separate pure-runtime regressions. */
test("player buys real adventurer salvage then forges and persists T2 at physical cellar anvil @ci-smoke",
  async({page})=>{
  test.setTimeout(240000);
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
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const {ECONOMY}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const state=withStockedSmallShelf(createGameState(7351));
    const seller=state.adventurers.find(h=>h.role==="DPS")!;
    if(!seller)throw Error("Fixture needs a DD");
    const seeded={...state,adventurers:state.adventurers.map(hero=>
      hero.id===seller.id?{...hero,status:"at-shop" as const,floor:"shop" as const,
        gold:100,health:hero.stats.maxHealth,equipment:{weapon:"Spear",armor:"Leather Vest"},
        inventory:{...hero.inventory,bread:ECONOMY.breadTarget,healing:ECONOMY.healingTarget,
          finds:{"iron-ore":1,coal:1,"ghoul-leather":2}}}:
        {...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...state.shopEconomy,slots:state.shopEconomy.slots.map(slot=>
        ({...slot,itemId:null,quantity:0}))}};
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
    if(!forge.hasHearth||!forge.hasTools||forge.flames!==3||forge.cosmeticPickables!==0)
      throw Error("Forge art must be present without competing interaction surfaces");
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
  await expect(spear).toHaveAttribute("data-ready","false");
  const armor=forge.locator(".forge-recipe").filter({hasText:"T2 Ghoul Leather Vest"});
  await armor.getByRole("button",{name:"Forge 1"}).click();
  await expect(forge.locator(".forge-result"))
    .toContainText("Forged 1 T2 Ghoul Leather Vest");
  await expect(forge.locator(".forge-reserve")).toContainText("Ghoul Leather 0");
  await expect(armor.getByRole("button",{name:"Forge 1"})).toBeDisabled();
  await forge.getByRole("button",{name:/Close/}).click();
  await page.keyboard.press("Tab");
  const bag=page.locator("#inventory-dialog");
  await expect(bag).toBeVisible();
  await expect(bag.locator('[data-bag-item="forged-spear"] strong')).toHaveText("1");
  await expect(bag.locator('[data-bag-item="ghoul-leather-vest"] strong')).toHaveText("1");
  await expect(bag.locator("[data-bind-slot][data-item-id]")).toHaveCount(0);
  await bag.locator('[data-bag-item="forged-spear"] .bag-item-pick').dragTo(bag.locator('[data-bind-slot="1"]'));
  await bag.locator('[data-bag-item="ghoul-leather-vest"] .bag-item-pick').dragTo(bag.locator('[data-bind-slot="2"]'));
  await expect(bag.locator('[data-bind-slot="1"]')).toHaveAttribute("data-item-id","forged-spear");
  await expect(bag.locator('[data-bind-slot="2"]')).toHaveAttribute("data-item-id","ghoul-leather-vest");
  await bag.locator('[data-bind-slot="1"]').dragTo(bag.locator('[data-bind-slot="2"]'));
  await expect(bag.locator('[data-bind-slot="2"]')).toHaveAttribute("data-item-id","forged-spear");
  await expect(bag.locator('[data-bind-slot="1"]')).toHaveAttribute("data-item-id","ghoul-leather-vest");
  await page.keyboard.press("Tab");
  await expect(bag).toBeHidden();
  await page.locator("#open-wholesale").click();
  const catalog=page.locator("#wholesale-catalog");
  await expect(catalog.locator(".catalog-row")).toHaveCount(7);
  for(const id of ["forged-sword-shield","forged-spear","forged-staff","ghoul-leather-vest","iron-ore","coal","ghoul-leather"])
    await expect(catalog.locator('[data-item-id="'+id+'"]')).toHaveCount(0);
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
  // Continue the very same persisted campaign, never a standalone cashier
  // harness. Stock the crafted spear in the real shelf via the player ray.
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    await probe.waitForShopStockAssets();
    await probe.waitForShelfSlotMesh();
    probe.aimAtShelfSlot();
  });
  const models=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPhysicalStockMeshes());
  expect(models).toHaveLength(11);
  expect(new Set(models.map(m=>m.sourceUrl)).size).toBe(models.length);
  for(const model of models){
    expect(model.sourceUrl).toContain("/assets/models/"+model.itemId+".glb");
    expect(model.vertices).toBeGreaterThan(20);
    expect(model.hasVertexPaint).toBe(true);
    expect(model.pickable||model.collisions).toBe(false);
  }
  const swordModel=models.find(m=>m.itemId==="forged-sword-shield")!;
  const spearModel=models.find(m=>m.itemId==="forged-spear")!;
  expect(swordModel.size[2]).toBeGreaterThan(spearModel.size[2]);
  expect(swordModel.vertices).not.toBe(spearModel.vertices);
  await expect(page.locator('#inventory [data-quickbar-slot="2"]')).toHaveAttribute("data-item-id","forged-spear");
  await page.keyboard.press("2");
  await expect(page.locator("#shop-shelf-focus")).toBeVisible();
  await expect(page.locator("#shelf-focus-action")).toContainText("T2 Spear");
  await page.mouse.click(400,300);
  await expect(page.locator("#status")).toContainText("Placed T2 Spear");
  await expect(page.locator('#inventory [data-item-id="forged-spear"] strong')).toHaveText("0");
  const heldStock=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectMerchantHeldStock());
  const physicalSpear={itemId:"forged-spear",
    sourceUrl:"/Dungeon-Shop-Master/assets/models/forged-spear.glb",
    vertices:spearModel.vertices,pickable:false,collision:false};
  await expect.poll(heldStock).toMatchObject(physicalSpear);
  // With a completely different selected bag item, take the spear back.
  // The first-person transfer must still use the real shelf product.
  // Actual bound keys remain usable in pointer lock.
  await page.keyboard.press("1");
  await expect(page.locator('#inventory [data-item-id="ghoul-leather-vest"]')).toHaveAttribute("aria-pressed","true");
  await page.mouse.click(400,300,{button:"right"});
  await expect(page.locator("#status")).toContainText("Returned T2 Spear");
  await expect(page.locator('#inventory [data-item-id="forged-spear"] strong')).toHaveText("1");
  await expect.poll(heldStock).toMatchObject(physicalSpear);
  await page.keyboard.press("2");
  await expect(page.locator('#inventory [data-item-id="forged-spear"]')).toHaveAttribute("aria-pressed","true");
  await page.mouse.click(400,300);
  await expect(page.locator("#status")).toContainText("Placed T2 Spear");
  await expect(page.locator('#inventory [data-item-id="forged-spear"] strong')).toHaveText("0");
  const save=()=>page.evaluate(async()=>{
    const hooks=window as Window&{__shopTestSaveTrafficNow?:()=>Promise<unknown>};
    await hooks.__shopTestSaveTrafficNow!();
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing campaign");
    return state;
  });
  const stocked=await save();
  expect(stocked.shopEconomy.slots[0].itemId).toBe("forged-spear");
  expect(stocked.shopEconomy.slots[0].quantity).toBe(1);
  await expect.poll(async()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectRenderedShopStock()[0].sourceUrls))
    .toEqual(["/Dungeon-Shop-Master/assets/models/forged-spear.glb"]);
  await page.evaluate(()=>{
    const hooks=window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void};
    hooks.__shopTestPauseWorld!(false);
  });
  // Autonomous NPC movement must reserve the actual shelf item and reach
  // the real register. Do not fabricate a cart or force the checkout queue.
  await expect.poll(()=>page.evaluate(()=>{
    const hooks=window as Window&{__shopTestReadyCheckout?:()=>string|null};
    return hooks.__shopTestReadyCheckout?.()??null;
  }),{timeout:85000,intervals:[300,700,1200]}).toBe(fixture.heroId);
  const held=await save();
  const buyer=held.adventurers.find(h=>h.id===fixture.heroId)!;
  expect(buyer.equipment.weapon).toBe("Spear");
  expect(held.shopEconomy.balance).toBe(stocked.shopEconomy.balance);
  expect(held.shopCarts.find(cart=>cart.heroId===fixture.heroId)?.lines)
    .toEqual([{itemId:"forged-spear",slotId:stocked.shopEconomy.slots[0].id,quantity:1,subtotal:25}]);
  expect(held.shopEconomy.slots[0].quantity).toBe(0);
  const carried=await page.evaluate(async(id)=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals()
      .visitors.find(v=>v.id===id)?.carriedStock??[],fixture.heroId);
  expect(carried).toContainEqual(expect.objectContaining({
    itemId:"forged-spear",source:"shared-shop-stock-glb",
    sourceUrl:"/Dungeon-Shop-Master/assets/models/forged-spear.glb",
    geometry:spearModel.vertices,
  }));
  await page.evaluate(async()=>{
    const {aimAtRegister}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing saved counter layout");
    aimAtRegister(state.shopLayout);
  });
  await page.keyboard.press("e");
  const cashier=page.locator("#cashier-overlay");
  await expect(cashier).toBeVisible();
  await expect(cashier.locator(".cashier-line")).toContainText("T2 Spear");
  // Stamp both actual on-screen success zones using the production register.
  for(const stage of ["Verify the goods","Seal the receipt"]){
    await expect(cashier.locator(".cashier-stage-name")).toHaveText(stage);
    const stamped=await page.evaluate(()=>new Promise<boolean>(resolve=>{
      const deadline=performance.now()+10000;
      const frame=()=>{
        const needle=document.querySelector<HTMLElement>("#cashier-overlay .cashier-needle");
        const target=document.querySelector<HTMLElement>("#cashier-overlay .cashier-target");
        const button=document.querySelector<HTMLButtonElement>("#cashier-overlay .cashier-stamp");
        if(!needle||!target||!button||performance.now()>deadline)return resolve(false);
        if(Math.abs(parseFloat(needle.style.left)-
          (parseFloat(target.style.left)+parseFloat(target.style.width)/2))<4){
          button.click();return resolve(true);
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
    expect(stamped).toBe(true);
    if(stage==="Verify the goods"){
      const halfway=await save();
      expect(halfway.adventurers.find(h=>h.id===fixture.heroId)?.equipment.weapon).toBe("Spear");
      expect(halfway.shopEconomy.balance).toBe(held.shopEconomy.balance);
    }
  }
  await expect(cashier.locator(".cashier-settlement")).toBeVisible();
  const paid=await save();
  expect(paid.adventurers.find(h=>h.id===fixture.heroId)?.equipment.weapon).toBe("Forged Spear");
  expect(paid.shopCarts.some(cart=>cart.heroId===fixture.heroId)).toBe(false);
  const receipts=paid.events.filter(e=>e.type==="sale"&&e.saleChannel==="manual"&&
    e.adventurerId===fixture.heroId&&e.itemId==="forged-spear");
  expect(receipts).toHaveLength(1);
  expect(receipts[0].revenue).toBe(25);
  const collected=paid.shopEconomy.balance-held.shopEconomy.balance;
  expect(collected).toBeGreaterThanOrEqual(25);
  expect(collected).toBeLessThanOrEqual(27);
  expect(buyer.gold-paid.adventurers.find(h=>h.id===fixture.heroId)!.gold).toBe(collected);
  await page.keyboard.press("Escape");
  // Observe the actual paid customer cross the one physical exit.
  await expect.poll(async()=>{
    const saved=await save();
    return saved.adventurers.find(h=>h.id===fixture.heroId)?.status;
  },{timeout:45000,intervals:[500,1000,1500]}).toBe("off-duty");
  const departed=await save();
  const customer=departed.adventurers.find(h=>h.id===fixture.heroId)!;
  expect(customer.equipment.weapon).toBe("Forged Spear");
  expect(customer.offDutyUntilDay).toBe(departed.day+3);
  expect(departed.events.filter(e=>e.type==="shop-departure"&&e.adventurerId===fixture.heroId)).toHaveLength(1);
  expect(errors).toEqual([]);
});
