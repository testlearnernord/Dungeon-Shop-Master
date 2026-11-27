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
  // No world tick advances in this fixture. A real idle clip must still
  // advance between rendered frames rather than freeze on lastStepTick.
  const idleProgress=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectEmployee()?.progress);
  const firstProgress=await idleProgress();
  expect(typeof firstProgress).toBe("number");
  await expect.poll(idleProgress,{timeout:10000}).not.toBe(firstProgress);
  await page.locator("#open-employees").click();
  const dialog=page.locator("#employee-dialog");
  await expect(dialog).toBeVisible();
  const cashier=dialog.getByLabel("Tettel Cashier priority");
  const restocking=dialog.getByLabel("Tettel Restocking priority");
  await expect(cashier).toHaveValue("0");
  await expect(dialog.locator(".employee-status")).toContainText("Off duty");
  await dialog.getByRole("button",{name:"Enable work"}).click();
  await expect(cashier).toHaveValue("1");
  await expect(restocking).toHaveValue("5");
  await expect(dialog.locator(".employee-status")).toContainText("Cellar passage closed");
  await restocking.selectOption("4");
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
  await expect.poll(()=>page.evaluate(()=>typeof (window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld)).toBe("function");
  await page.evaluate(()=>{(window as Window&{__shopTestPauseWorld:(p:boolean)=>void}).__shopTestPauseWorld(false);});
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
    await expect.poll(async()=> (await read()).diagnostic.tick??0,{timeout:30000}).toBeGreaterThan(0);
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


test("Tettel grants one physical credit petition and the visitor leaves without a cash sale @ci-smoke",async({page})=>{
  test.setTimeout(240000);
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
    const {counterDockPoint}=await import("/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const base=withStockedSmallShelf(createGameState(7351));
    const buyer=base.adventurers.find(h=>h.status==="at-shop")!;
    // Start the worker in the shop to isolate real petitioner traffic and
    // service from the separately tested cellar route.
    const dock=counterDockPoint(base.shopLayout,"staff");
    const state={...base,cellarDoorOpen:true,adventurers:base.adventurers.map(h=>
      h.id===buyer.id?{...h,status:"at-shop" as const,floor:"shop" as const,gold:0,
        inventory:{...h.inventory,bread:0,healing:0}}:
        {...h,status:"off-duty" as const,floor:"away" as const,offDutyUntilTick:4800,shopStayDays:0}),
      employees:base.employees.map(e=>({...e,...dock,priorities:{...e.priorities,charity:1 as const}}))};
    await new CampaignStorage().saveGame(state);
    return {buyer:buyer.id,gold:state.shopEconomy.balance,bread:3};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await expect.poll(()=>page.evaluate(()=>typeof (window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld)).toBe("function");
  await page.evaluate(()=>{(window as Window&{__shopTestPauseWorld:(p:boolean)=>void}).__shopTestPauseWorld(false);});
  const read=()=>page.evaluate(async id=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const s=await new CampaignStorage().loadGame();
    return {credits:s?.events.filter(e=>e.type==="shop-credit"&&e.adventurerId===id)??[],
      sales:s?.events.filter(e=>e.type==="sale"||e.type==="tip")??[],
      debt:s?.shopDebts.find(d=>d.heroId===id)?.outstandingGold,
      balance:s?.shopEconomy.balance,
      bread:s?.shopEconomy.slots.find(slot=>slot.itemId==="bread")?.quantity,
      departed:s?.events.some(e=>e.type==="shop-departure"&&e.adventurerId===id),
      diagnostic:{tick:s?.worldClock.tick,worker:s?.employees[0],requests:s?.shopRequests,
        actor:s?.shopTraffic.actors.find(a=>a.heroId===id),
        claim:s?.shopTraffic.claims.find(c=>c.heroId===id),buyer:s?.adventurers.find(h=>h.id===id)}};
  },fixture.buyer);
  try{
    await expect.poll(async()=> (await read()).credits.length,{timeout:100000,intervals:[500,1000,2000]}).toBe(1);
  }catch(error){
    console.log("EMPLOYEE CREDIT FAILURE "+JSON.stringify((await read()).diagnostic));
    throw error;
  }
  const settled=await read();
  expect(settled.credits[0].message).toContain("Served by Tettel.");
  expect(settled.debt).toBe(4);
  expect(settled.bread).toBe(fixture.bread-1);
  expect(settled.balance).toBe(fixture.gold);
  expect(settled.sales).toEqual([]);
  await expect.poll(async()=> (await read()).departed,{timeout:90000,intervals:[1000,2000]}).toBe(true);
  expect((await read()).credits).toHaveLength(1);
  expect(errors).toEqual([]);
});


test("Tettel restocks real assigned goods and serves two physical customers on the shared clock @ci-smoke",async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
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
    const {ECONOMY}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const base=withStockedSmallShelf(createGameState(7351));
    const buyers=base.adventurers.filter(h=>h.status==="at-shop").slice(0,2).map(h=>h.id);
    if(buyers.length!==2)throw Error("Combined fixture requires two real buyers");
    const state={...base,cellarDoorOpen:true,adventurers:base.adventurers.map(h=>
      buyers.includes(h.id)?{...h,gold:100,health:h.stats.maxHealth,
        inventory:{...h.inventory,bread:0,healing:ECONOMY.healingTarget}}:
        {...h,status:"off-duty" as const,floor:"away" as const,offDutyUntilTick:4800,shopStayDays:0}),
      shopEconomy:{...base.shopEconomy,bag:{...base.shopEconomy.bag,bread:0,"healing-herb":2},
        slots:base.shopEconomy.slots.map(s=>s.itemId==="bread"?{...s,quantity:4}:
          s.itemId==="healing-herb"?{...s,quantity:0}:s)},
      employees:base.employees.map(e=>({...e,priorities:{cashier:1 as const,restocking:5 as const,charity:0 as const}}))};
    await new CampaignStorage().saveGame(state);
    return {buyers,gold:state.shopEconomy.balance};
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await expect.poll(()=>page.evaluate(()=>typeof (window as Window&{__shopTestPauseWorld?:(p:boolean)=>void}).__shopTestPauseWorld)).toBe("function");
  await page.evaluate(()=>{(window as Window&{__shopTestPauseWorld:(p:boolean)=>void}).__shopTestPauseWorld(false);});
  const read=()=>page.evaluate(async ids=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const s=await new CampaignStorage().loadGame();
    if(!s)throw Error("Missing combined campaign");
    const sales=s.events.filter(e=>e.type==="sale");
    const buyerSales=sales.filter(e=>e.adventurerId&&ids.includes(e.adventurerId));
    const quantities=(id:string)=>s.shopEconomy.slots.filter(slot=>slot.itemId===id)
      .reduce((n,slot)=>n+slot.quantity,0);
    return {sales,buyerSales,balance:s.shopEconomy.balance,
      departed:ids.filter(id=>s.events.some(e=>e.type==="shop-departure"&&e.adventurerId===id)),
      bread:quantities("bread"),herbs:quantities("healing-herb"),
      herbBag:s.shopEconomy.bag["healing-herb"],
      breadHeld:s.shopCarts.flatMap(c=>c.lines).filter(l=>l.itemId==="bread").reduce((n,l)=>n+l.quantity,0),
      breadSold:sales.filter(e=>e.itemId==="bread").reduce((n,e)=>n+(e.quantity??0),0),
      tips:s.events.filter(e=>e.type==="tip"),credits:s.events.filter(e=>e.type==="shop-credit"),
      assignments:s.shopEconomy.slots.map(slot=>({id:slot.id,item:slot.itemId})),
      diagnostic:{tick:s.worldClock.tick,worker:s.employees[0],actors:s.shopTraffic.actors,
        claims:s.shopTraffic.claims,carts:s.shopCarts,requests:s.shopRequests}};
  },fixture.buyers);
  const initialAssignments=[{id:"shelf-1-slot-1",item:null},{id:"shelf-1-slot-2",item:"bread"},
    {id:"shelf-1-slot-3",item:"healing-herb"},{id:"shelf-1-slot-4",item:null}];
  let sawCargo=false,sawCashier=false;
  try{
    await expect.poll(async()=>{
      const s=await read();
      sawCargo||=s.diagnostic.worker.restock?.stage==="deliver";
      sawCashier||=s.diagnostic.worker.job?.task==="cashier";
      expect(s.bread+s.breadHeld+s.breadSold).toBe(4);
      expect(s.herbs+s.herbBag).toBe(2);
      expect(s.assignments).toEqual(initialAssignments);
      expect(s.tips).toEqual([]);expect(s.credits).toEqual([]);
      return {paid:new Set(s.buyerSales.map(e=>e.adventurerId)).size,herbs:s.herbs,departed:s.departed.length};
    },{timeout:150000,intervals:[500,1000,2000]}).toEqual({paid:2,herbs:2,departed:2});
  }catch(error){
    console.log("COMBINED EMPLOYEE FAILURE "+JSON.stringify(await read()));
    throw error;
  }
  const done=await read();
  expect(sawCargo).toBe(true);expect(sawCashier).toBe(true);
  expect(done.buyerSales).toHaveLength(2);
  expect(done.buyerSales.every(e=>e.itemId==="bread"&&e.quantity===2&&
    e.message.includes("Served by Tettel."))).toBe(true);
  expect(done.balance).toBe(fixture.gold+16);
  expect(done.herbBag).toBe(0);
  expect(done.diagnostic.carts).toEqual([]);
  expect(errors).toEqual([]);
});
