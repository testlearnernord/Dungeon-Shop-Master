import {expect,test} from "@playwright/test";

/**
 * Recreate Day 1: several buyers need bread from the SAME shelf. Their bodies
 * are cosmetic, but stock reservation is authoritative and only one shopper
 * may physically inspect the shelf at once.
 */
test("same-shelf Day 1 shoppers continue moving and collect goods without a deadlock",async({page})=>{
  test.setTimeout(100_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(72541);
    const prepared={...initial,
      adventurers:initial.adventurers.map(person=>person.status==="at-shop"?
        {...person,gold:100,inventory:{...person.inventory,food:0}}:person),
      shopEconomy:{...initial.shopEconomy,
        slots:initial.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-1"||slot.id==="shelf-1-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}:slot)},
    };
    await new CampaignStorage().saveGame(prepared);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const start=await read();
  expect(start.visitors.filter(v=>v.status==="at-shop").length).toBeGreaterThanOrEqual(3);
  await expect.poll(async()=>{
    const now=await read();
    return now.visitors.filter(v=>(v.cartUnits??0)>0).length;
  },{timeout:50_000,intervals:[1000,2000,3000]}).toBeGreaterThanOrEqual(2);
  const after=await read();
  expect(after.visitors.every(v=>v.wallClear)).toBe(true);
  expect(after.visitors.some(v=>v.shoppingPhase==="awaiting-checkout"||
    (v.cartUnits??0)>0)).toBe(true);
  expect(errors).toEqual([]);
});
