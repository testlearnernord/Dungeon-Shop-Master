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
