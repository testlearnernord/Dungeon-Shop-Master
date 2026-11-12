import {expect,test} from "@playwright/test";

async function seedEmptyShop(page:import("@playwright/test").Page) {
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const shopper=initial.adventurers[0];
    const state={
      ...initial,
      adventurers:initial.adventurers.map((hero,index)=>index===0
        ?{...hero,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...hero.inventory,food:0},equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const}),
      shopEconomy:{...initial.shopEconomy,
        slots:initial.shopEconomy.slots.map(slot=>({
          ...slot,quantity:0,itemId:null,
        }))},
    };
    await new CampaignStorage().saveGame(state);
    return shopper.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=async()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async()=>{
    const state=await inspect();
    return state.visitors.find(v=>v.id===heroId)?.shoppingPhase;
  },{timeout:40000,intervals:[250,500,1000]}).toBe("waiting-for-restock");
  return {heroId,inspect};
}

test("sold-out customer displays requested bread icon and resumes buying after restocking",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const {heroId,inspect}=await seedEmptyShop(page);
  const waiting=(await inspect()).visitors.find(v=>v.id===heroId)!;
  expect(waiting.shoppingReason).toBe("unavailable");
  expect(waiting.wantedItemId).toBe("bread");
  expect(waiting.restockRemaining).toBeGreaterThan(0);
  expect(waiting.restockRemaining).toBeLessThanOrEqual(60);
  const bubble=page.locator(".npc-wish-bubble");
  await expect(bubble).toHaveCount(1);
  await expect(bubble.locator("use")).toHaveAttribute("href",/ui-item-icons\.svg#bread$/);
  await expect(bubble.locator(".npc-wish-detail")).toContainText("Waybread");
  await page.waitForTimeout(1150);
  const remaining=(await inspect()).visitors.find(v=>v.id===heroId)!.restockRemaining!;
  expect(remaining).toBeLessThan(waiting.restockRemaining!);
  const stock=await page.evaluate(()=>{
    const test=window as Window&{__shopTestStockItem?:(slot:string,item:"bread")=>string};
    if(!test.__shopTestStockItem)throw new Error("No restock E2E hook");
    return test.__shopTestStockItem("shelf-1-slot-2","bread");
  });
  expect(stock).toContain("Placed");
  await expect.poll(async()=>{
    const state=await inspect();
    return state.visitors.find(v=>v.id===heroId)?.cartUnits??0;
  },{timeout:35000,intervals:[500,1000]}).toBeGreaterThan(0);
  const after=(await inspect()).visitors.find(v=>v.id===heroId)!;
  expect(after.shoppingPhase).not.toBe("waiting-for-restock");
  expect(after.wantedItemId).toBeFalsy();
  await expect(bubble).toHaveCount(0);
  const persisted=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(persisted?.events.some(event=>event.type==="shop-walkout"&&
    event.adventurerId===heroId)).toBe(false);
  expect(errors).toEqual([]);
});

test("expired stock request produces angry walkout and no next-day phantom sale",async({page})=>{
  test.setTimeout(75000);
  const {heroId,inspect}=await seedEmptyShop(page);
  await page.evaluate(id=>{
    const hook=window as Window&{
      __shopTestRestockWait?:(heroId:string,remaining:number)=>void,
    };
    if(!hook.__shopTestRestockWait)throw new Error("No wait E2E hook");
    hook.__shopTestRestockWait(id,0.25);
  },heroId);
  await expect.poll(async()=> (await inspect()).visitors.find(v=>v.id===heroId)?.shoppingPhase,
    {timeout:12000}).toBe("leaving-upset");
  await expect(page.locator(".npc-wish-bubble.is-angry .npc-wish-timer"))
    .toHaveText("NO SALE!");
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.events.some(event=>event.type==="shop-walkout"&&
      event.adventurerId==="adventurer-1")??false;
  }),{timeout:10000}).toBe(true);
  // The visitor has already abandoned their visit. Restock cannot cause
  // an automatic retroactive sale at the next confirmed day boundary.
  await page.evaluate(()=>{
    const test=window as Window&{__shopTestStockItem?:(slot:string,item:"bread")=>string};
    test.__shopTestStockItem?.("shelf-1-slot-2","bread");
  });
  await page.evaluate(()=>{
    const test=window as Window&{__shopTestAdvanceDay?:()=>void};
    test.__shopTestAdvanceDay?.();
  });
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.day;
  }),{timeout:12000}).toBe(2);
  const next=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(next?.events.some(event=>event.type==="sale"&&event.adventurerId===heroId))
    .toBe(false);
});
