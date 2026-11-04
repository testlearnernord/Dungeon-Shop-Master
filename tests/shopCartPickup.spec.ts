import { expect, test } from "@playwright/test";

test("real 3D shelf pickup reserves stock, displays a hand-held item and survives reload",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const seed=7351;
  const heroId=await page.evaluate(async(seed)=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const starting=createGameState(seed);
    const prepared={...starting,adventurers:starting.adventurers.map((hero,i)=>
      i===0?{...hero,gold:100,
        inventory:{...hero.inventory,food:0,healing:0},
        equipment:{weapon:null,armor:null},
        health:Math.max(1,hero.health-20)}:hero)};
    await new CampaignStorage().saveGame(prepared);
    return starting.adventurers[0].id;
  },seed);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  const original=await read();
  const startingBread=original!.shopEconomy.slots.find(slot=>
    slot.id==="shelf-1-slot-2")!.quantity;
  await expect.poll(async()=>{
    const state=await read();
    return state?.shopCarts.find(cart=>cart.heroId===heroId)?.lines
      .find(line=>line.slotId==="shelf-1-slot-2")?.quantity??0;
  },{timeout:60000,intervals:[400,700,1000]}).toBeGreaterThan(0);
  const reserved=await read();
  const held=reserved!.shopCarts.find(cart=>cart.heroId===heroId)!;
  const breadLine=held.lines.find(line=>line.itemId==="bread")!;
  expect(held.day).toBe(1);
  expect(reserved!.shopEconomy.slots.find(slot=>slot.id===breadLine.slotId)!.quantity)
    .toBe(startingBread-breadLine.quantity);
  expect(reserved!.shopEconomy.balance).toBe(original!.shopEconomy.balance);
  expect(reserved!.adventurers[0].gold).toBe(100);
  expect(reserved!.events.filter(event=>event.type==="sale")).toHaveLength(0);
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async()=>{
    const visual=(await inspect()).visitors.find(v=>v.id===heroId);
    return visual?.cartUnits??0;
  }).toBeGreaterThan(0);
  const scene=await inspect();
  const hero=scene.visitors.find(v=>v.id===heroId)!;
  expect(hero.carriedMeshes).toBeGreaterThan(0);
  expect(hero.cartPaid).toBe(false);
  expect(hero.cartTotal).toBeGreaterThan(0);
  expect(hero.unpickable).toBe(true);

  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const reloaded=await read();
  expect(reloaded!.shopCarts).toEqual(reserved!.shopCarts);
  await expect.poll(async()=>{
    const visual=(await inspect()).visitors.find(v=>v.id===heroId);
    return visual?.carriedMeshes??0;
  },{timeout:15000}).toBeGreaterThan(0);

  await page.keyboard.press("n");
  await page.keyboard.press("z");
  await expect(page.locator("#day")).toHaveText("Day 2");
  const settled=await read();
  expect(settled!.shopCarts).toEqual([]);
  expect(settled!.events.filter(event=>event.day===2&&event.type==="sale"&&
    event.adventurerId===heroId&&event.itemId==="bread")).toHaveLength(1);
  expect(settled!.shopEconomy.balance).toBeGreaterThan(original!.shopEconomy.balance);
  expect(errors).toEqual([]);
});

test("warehouse operations are blocked while a hero holds unpaid stock",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const result=await page.evaluate(async()=>{
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const state=createGameState(7351);
    const store=new GameStore({...state,adventurers:state.adventurers.map((hero,i)=>
      i===0?{...hero,gold:100,inventory:{...hero.inventory,food:0}}:hero)});
    const hero=store.state.adventurers[0].id;
    const picked=store.pickUpShopItem(hero,"shelf-1-slot-2");
    const before=store.state.shopEconomy.slots.find(x=>x.id==="shelf-1-slot-2")!.quantity;
    const blocked=store.transfer("shelf-1-slot-2","bread","stock");
    const after=store.state.shopEconomy.slots.find(x=>x.id==="shelf-1-slot-2")!.quantity;
    return {picked,blocked,before,after,cartCount:store.state.shopCarts.length};
  });
  expect(result.picked).toContain("unpaid");
  expect(result.blocked).toContain("held by customers");
  expect(result.after).toBe(result.before);
  expect(result.cartCount).toBe(1);
});
