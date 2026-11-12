import {expect,test} from "@playwright/test";

test("credit petition transfers one bread and saves Galvik's loan",async({page})=>{
  test.setTimeout(90000);
  await page.goto("./");
  const id=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=createGameState(7351);
    const heroId=state.adventurers[0].id;
    await new CampaignStorage().saveGame({
      ...state,
      adventurers:state.adventurers.map((hero,i)=>i===0
        ?{...hero,gold:0,inventory:{...hero.inventory,food:0}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...state.shopEconomy,slots:state.shopEconomy.slots.map(slot=>
        slot.id==="shelf-1-slot-2"?{...slot,itemId:"bread" as const,quantity:2}:slot)},
    });
    return heroId;
  });
  await page.reload();
  const read=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async()=> (await read()).visitors.find(v=>v.id===id)?.shoppingPhase,
    {timeout:45000}).toBe("waiting-for-credit");
  await page.evaluate(async(heroId)=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBeggingVisitor(heroId),id);
  await page.keyboard.press("e");
  await expect(page.locator("#beggar-dialog")).toBeVisible();
  await expect(page.locator("#beggar-item-name")).toContainText("Waybread");
  await page.locator("#beggar-credit").click();
  await expect(page.locator("#beggar-dialog")).toBeHidden();
  await expect.poll(async()=>page.evaluate(async(heroId)=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.shopDebts.find(debt=>debt.heroId===heroId)?.outstandingGold??0;
  },id)).toBe(4);
  const recorded=await page.evaluate(async(heroId)=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=(await new CampaignStorage().loadGame())!;
    return {hero:state.adventurers.find(hero=>hero.id===heroId),
      remaining:state.shopEconomy.slots.find(slot=>slot.id==="shelf-1-slot-2")?.quantity,
      receipts:state.events.filter(event=>event.type==="sale"),
      credits:state.events.filter(event=>event.type==="shop-credit"),
      dailySales:state.shopEconomy.dailySales};
  },id);
  expect(recorded.hero?.gold).toBe(0);
  expect(recorded.hero?.inventory.food).toBe(1);
  expect(recorded.remaining).toBe(1);
  expect(recorded.receipts).toHaveLength(0);
  expect(recorded.credits).toHaveLength(1);
  expect(recorded.dailySales.revenue).toBe(0);
});
