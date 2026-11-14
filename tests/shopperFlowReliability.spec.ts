import {expect,test} from "@playwright/test";

/** Exercises arrival at the relocated cash register without bypassing NPC
 * pathfinding or marking a payment in the save. */
test("a single buyer can reach and request service at a rotated register",async({page})=>{
  test.setTimeout(100000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const buyer=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {replaceCounterPlacement}=await import("/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const moved=replaceCounterPlacement(initial.shopLayout,{x:0,z:2.25,rotation:1});
    if(moved.message!=="Counter placement saved.")throw Error(moved.message);
    const hero=initial.adventurers[0];
    const state={...initial,shopLayout:moved.layout,
      adventurers:initial.adventurers.map((visitor,index)=>index===0
        ?{...visitor,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...visitor.inventory,bread:0}}
        :{...visitor,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...initial.shopEconomy,
        slots:initial.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:5}:slot)}
    };
    await new CampaignStorage().saveGame(state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const ready=()=>page.evaluate(()=>{
    const hook=(window as Window&{__shopTestReadyCheckout?:()=>string|null})
      .__shopTestReadyCheckout;
    return hook?.()??null;
  });
  await expect.poll(ready,{timeout:65000,intervals:[400,800,1500]}).toBe(buyer);
  const visuals=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  expect(visuals.visitors.find(v=>v.id===buyer)?.shoppingPhase).toBe("awaiting-checkout");
  expect(errors).toEqual([]);
});


/** Browser-only crowd test. Deliberately combines relocated furniture, eight
 * simultaneous customer spawns, and limited Waybread stock. This catches
 * actual Babylon movement failures missed by pure route allocation tests. */
test("eight incoming customers progress around relocated shelves and checkout",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {replaceShelfPlacement,replaceCounterPlacement}=await import(
      "/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {shopServiceReachabilityProblem}=await import(
      "/Dungeon-Shop-Master/src/game/shopServiceReachability.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const original=createGameState(7351);
    const movedShelf=replaceShelfPlacement(original.shopLayout,{
      id:"shelf-1",x:0,z:-2,rotation:1,
    });
    if(movedShelf.message!=="Shelf placement saved.")throw Error(movedShelf.message);
    const movedCounter=replaceCounterPlacement(movedShelf.layout,{
      x:0,z:2.25,rotation:1,
    });
    if(movedCounter.message!=="Counter placement saved.")
      throw Error(movedCounter.message);
    const problem=shopServiceReachabilityProblem(
      movedCounter.layout,original.level5Room);
    if(problem)throw Error(problem);
    const state={
      ...original,shopLayout:movedCounter.layout,
      adventurers:original.adventurers.map((hero,index)=>index<8
        ?{...hero,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...hero.inventory,bread:0,healing:0},
          equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...original.shopEconomy,
        slots:original.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-2"||slot.id==="shelf-2-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}
            :{...slot,itemId:null,quantity:0})},
    };
    await new CampaignStorage().saveGame(state);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const starting=await read();
  expect(starting.visitors.length).toBeGreaterThanOrEqual(8);
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.filter(visitor=>(visitor.cartUnits??0)>0 ||
      visitor.shoppingPhase==="waiting-for-restock"||
      visitor.shoppingPhase==="awaiting-checkout").length;
  },{timeout:75000,intervals:[1000,2000,3000]}).toBeGreaterThanOrEqual(3);
  const final=await read();
  expect(final.visitors.every(visitor=>visitor.wallClear)).toBe(true);
  expect(final.visitors.some(visitor=>(visitor.cartUnits??0)>0)).toBe(true);
  expect(errors).toEqual([]);
});

/** End-to-end check of the same contextual P flow used by shelves, now with
 * a grouped bedroom prop. The Book of Debts, desk and collider must never
 * split up, and the placement must survive save/reload. */
test("contextual P moves the accounting desk with its Book of Debts and collision",async({page})=>{
  test.setTimeout(80000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtDebtBook());
  await expect(page.locator("#furniture-look-prompt")).toContainText("Book of Debts");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await expect(page.locator("#blueprint-panel h2")).toContainText("Accounting desk");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtBedroomPlacement(-2.25,-9.75));
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:10000}).toBe("true");
  await page.keyboard.press("r");
  await expect(page.locator("#blueprint-facing")).toContainText("90°");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.bedroomFurniture?.find(item=>item.id==="desk")?.z;
  }),{timeout:15000}).toBe(-9.75);
  const before=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectModularBedroom());
  expect(before.desk.z).toBeCloseTo(-9.75,3);
  expect(before.deskCollider.z).toBeCloseTo(-9.75,3);
  await page.reload();
  const persisted=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectModularBedroom());
  expect(persisted.desk.z).toBeCloseTo(before.desk.z,3);
  expect(persisted.book.z).toBeCloseTo(before.book.z,3);
  expect(persisted.deskCollider.z).toBeCloseTo(before.deskCollider.z,3);
  expect(persisted.candleLightParent).toBe("bedroom-module-candle");
  expect(errors).toEqual([]);
});

/** Physically move both remaining fixtures through P. The sleep action and
 * roster interaction must follow their moved meshes after a full reload. */
test("movable bed still closes the day and relocated board still opens the roster",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const api="/Dungeon-Shop-Master/tests/scene.ts";

  await page.evaluate(async(url)=>{(await import(url)).aimAtBed();},api);
  await expect(page.locator("#furniture-look-prompt")).toContainText("Galvik's bed");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel h2")).toContainText("Galvik's bed");
  await page.evaluate(async(url)=>{(await import(url)).aimAtBedroomPlacement(0.75,-10);},api);
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:15000}).toBe("true");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const afterBed=await page.evaluate(async(url)=>
    (await import(url)).inspectMovedBedAndBoard(),api);
  expect(afterBed.mattress.z).toBeCloseTo(-10,2);
  expect(afterBed.frame.z).toBeCloseTo(-10,1);

  await page.evaluate(async(url)=>{(await import(url)).aimAtRosterBoard();},api);
  await expect(page.locator("#furniture-look-prompt")).toContainText("Adventurer board");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel h2")).toContainText("Adventurer board");
  await page.evaluate(async(url)=>{(await import(url)).aimAtMainShopWall(5.5,-7);},api);
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:15000}).toBe("true");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const moved=await page.evaluate(async(url)=>(
    await import(url)).inspectMovedBedAndBoard(),api);
  expect(moved.roster.x).toBeCloseTo(5.5,2);
  expect(moved.rosterFrame.x).toBeGreaterThan(5.5);
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return {bed:state?.bedroomFurniture?.find(p=>p.id==="bed")?.z,
      board:state?.rosterBoard?.x};
  }),{timeout:15000}).toEqual({bed:-10,board:5.5});

  await page.reload();
  const persisted=await page.evaluate(async(url)=>
    (await import(url)).inspectMovedBedAndBoard(),api);
  expect(persisted.mattress.z).toBeCloseTo(-10,2);
  expect(persisted.roster.x).toBeCloseTo(5.5,2);
  expect(persisted.rosterFrame.x).toBeCloseTo(moved.rosterFrame.x,2);

  await page.evaluate(async(url)=>{(await import(url)).aimAtRelocatedRosterBoard();},api);
  await page.keyboard.press("e");
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await page.locator("#close-roster").click();
  await page.evaluate(async(url)=>{(await import(url)).aimAtBed();},api);
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:12000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});
