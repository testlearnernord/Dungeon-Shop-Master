import {expect,test} from "@playwright/test";
test("Tettel is a real peaceful cellar Ghoul and work priorities survive reload @ci-smoke",async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect.poll(async()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const e=probe.inspectEmployee();
    return !!e?.ready&&e.enabled&&e.peaceful&&e.y< -4&&e.z< -20&&e.clip==="idle_combat";
  }),{timeout:90000}).toBe(true);
  await page.locator("#open-employees").click();
  const dialog=page.locator("#employee-dialog");
  await expect(dialog).toBeVisible();
  const cashier=dialog.getByLabel("Tettel Cashier priority");
  const restocking=dialog.getByLabel("Tettel Restocking priority");
  await expect(cashier).toHaveValue("0");
  await cashier.selectOption("1");await restocking.selectOption("4");
  await dialog.locator("#close-employees").click();
  await expect(dialog).toBeHidden();
  // Save cadence may defer a non-clock write; actual storage must observe it.
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.employees[0].priorities;
  }),{timeout:20000}).toEqual({cashier:1,restocking:4,charity:0});
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await page.locator("#open-employees").click();
  await expect(cashier).toHaveValue("1");await expect(restocking).toHaveValue("4");
  expect(errors).toEqual([]);
});

test("Galvik assigns an unowned product to a real empty shelf and explicitly clears it after reload @ci-smoke",async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  // Preload diagnostic dependencies before seeding the genuine persisted layout.
  await expect.poll(async()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return probe.shopSceneReady();
  }),{timeout:45000}).toBe(true);
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    await new CampaignStorage().saveGame(withStockedSmallShelf(createGameState(7351)));
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  const aim=async()=>{
    await expect.poll(async()=>page.evaluate(async()=>{
      const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
      if(!probe.shopSceneReady())return false;
      try{probe.aimAtShelfSlot();return true;}catch{return false;}
    }),{timeout:30000}).toBe(true);
    await expect(page.locator("#shop-shelf-focus")).toHaveAttribute("data-slot-id","shelf-1-slot-1");
  };
  await page.keyboard.press("Tab");
  const inventory=page.locator("#inventory-dialog");
  await expect(inventory).toBeVisible();
  await inventory.locator('[data-bag-item="forged-spear"] .bag-item-pick').click();
  await inventory.locator('[data-bind-slot="1"]').click();
  await inventory.getByRole("button",{name:"Close (TAB / Esc)"}).click();
  await page.keyboard.press("1");
  const middleClick=async()=>{
    const bounds=await page.locator("#renderCanvas").boundingBox();
    if(!bounds)throw Error("Shop canvas missing");
    await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:"middle"});
  };
  const note=()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return probe.inspectShelfAssignmentNote("shelf-1-slot-1");
  });
  const expectedNote={itemId:"forged-spear",parent:"shelf-1-root",
    pickable:false,collisions:false,enabled:true,textureReady:true};
  await aim();
  await middleClick();
  await expect.poll(note,{timeout:15000}).toEqual(expectedNote);
  const read=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    const slot=state?.shopEconomy.slots.find(s=>s.id==="shelf-1-slot-1");
    return {itemId:slot?.itemId,quantity:slot?.quantity,bag:state?.shopEconomy.bag["forged-spear"]};
  });
  await expect.poll(read,{timeout:20000}).toEqual({itemId:"forged-spear",quantity:0,bag:0});
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await aim();
  await expect.poll(note,{timeout:15000}).toEqual(expectedNote);
  await page.keyboard.press("1");
  await middleClick();
  await expect.poll(note,{timeout:15000}).toBeNull();
  await expect.poll(read,{timeout:20000}).toEqual({itemId:null,quantity:0,bag:0});
  expect(errors).toEqual([]);
});

test("Tettel physically serves a real shopper at the register without player payment or tips @ci-smoke",async({page})=>{
  test.setTimeout(300000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await expect.poll(async()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return probe.shopSceneReady();
  }),{timeout:45000}).toBe(true);
  const fixture=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const base=withStockedSmallShelf(createGameState(7351));
    const buyer=base.adventurers.find(h=>h.status==="at-shop")!;
    if(!buyer)throw Error("Fixture requires a real shop visitor");
    const state={...base,cellarDoorOpen:true,adventurers:base.adventurers.map(h=>
      h.id===buyer.id?{...h,status:"at-shop" as const,floor:"shop" as const,
        gold:100,health:Math.max(1,h.health-20),inventory:{...h.inventory,bread:0,healing:0},
        equipment:{weapon:null,armor:null}}:
        {...h,status:"off-duty" as const,floor:"away" as const,offDutyUntilTick:4800,shopStayDays:0}),
      employees:base.employees.map(e=>({...e,priorities:{...e.priorities,cashier:1 as const}}))};
    await new CampaignStorage().saveGame(state);
    return {buyer:buyer.id,gold:state.shopEconomy.balance,buyerGold:100};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await page.evaluate(()=>{(window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld?.(false);});
  const read=()=>page.evaluate(async id=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const s=await new CampaignStorage().loadGame();
    const receipts=s?.events.filter(e=>e.type==="sale"&&e.adventurerId===id)??[];
    return {receipts,tips:s?.events.filter(e=>e.type==="tip")??[],
      balance:s?.shopEconomy.balance,buyerGold:s?.adventurers.find(h=>h.id===id)?.gold,
      unpaid:s?.shopCarts.some(c=>c.heroId===id),
      departed:s?.events.some(e=>e.type==="shop-departure"&&e.adventurerId===id),
      diagnostic:{tick:s?.worldClock.tick,day:s?.day,cellarDoorOpen:s?.cellarDoorOpen,
        worker:s?.employees[0],buyer:s?.adventurers.find(h=>h.id===id),
        actor:s?.shopTraffic.actors.find(a=>a.heroId===id),
        claim:s?.shopTraffic.claims.find(c=>c.heroId===id),carts:s?.shopCarts}};
  },fixture.buyer);
  try{
    await expect.poll(async()=> (await read()).receipts.length,{timeout:150000,intervals:[500,1000,2000]}).toBeGreaterThan(0);
  }catch(error){
    const failure=await read();
    console.log("EMPLOYEE CHECKOUT FAILURE "+JSON.stringify(failure.diagnostic));
    throw error;
  }
  const settled=await read();
  const total=settled.receipts.reduce((sum,e)=>sum+(e.revenue??0),0);
  expect(settled.receipts.every(e=>e.message.includes("Served by Tettel."))).toBe(true);
  expect(settled.balance).toBe(fixture.gold+total);
  expect(settled.buyerGold).toBe(fixture.buyerGold-total);
  expect(settled.unpaid).toBe(false);expect(settled.tips).toEqual([]);
  await expect.poll(async()=> (await read()).departed,{timeout:90000,intervals:[1000,2000]}).toBe(true);
  expect(errors).toEqual([]);
});
