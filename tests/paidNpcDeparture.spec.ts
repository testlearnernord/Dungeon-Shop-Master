import {expect,test} from "@playwright/test";

test("same-day manual receipts send customers toward the exit, not back to the shelves",async({page})=>{
  await page.goto("./");
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const initial=withStockedSmallShelf(createGameState(72541));
    const hero=initial.adventurers[0];
    const prepared={...initial,
      adventurers:initial.adventurers.map(person=>person.id===hero.id
        ?{...person,status:"at-shop" as const,floor:"shop" as const}:person),
      events:[...initial.events,{
        id:"day-1:"+hero.id+":sale:shelf-1-slot-2:manual",
        type:"sale" as const,saleChannel:"manual" as const,day:1,
        adventurerId:hero.id,itemId:"bread" as const,quantity:1,revenue:4,
        message:hero.name+" bought Waybread for 4 gold.",
      }],
    };
    await new CampaignStorage().saveGame(prepared);
    return hero.id;
  });
  await page.reload();
  await expect.poll(async()=>page.evaluate(async(id)=>{
    const {inspectNpcVisuals}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const hero=inspectNpcVisuals().visitors.find(visitor=>visitor.id===id);
    // On loading an already-paid save, an outside visitor can finish the
    // shortest possible exit within two frames. No forced trek into the shop.
    return hero===undefined||hero.phase==="leaving"&&hero.cartPaid===true;
  },heroId)).toBe(true);
  await expect.poll(async()=>page.evaluate(async id=>{
    const {inspectNpcVisuals}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return inspectNpcVisuals().visitors.some(visitor=>visitor.id===id);
  },heroId),{timeout:10000}).toBe(false);
  await expect(page.locator("#day")).toHaveText("Day 1");
});
