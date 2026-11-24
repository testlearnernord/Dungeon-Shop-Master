import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("every displayable good has its own real GLB, not pickable shelf blockers", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const models = await page.evaluate(async () => {
    const testScene = await import("/Dungeon-Shop-Master/tests/scene.ts");
    return testScene.inspectPhysicalStockMeshes();
  });
  expect(models.map(model => model.itemId)).toEqual([
    "healing-herb", "mana-potion",
    "bread", "iron-sword", "spear", "staff", "leather-vest",
    "forged-sword-shield", "forged-spear", "forged-staff", "ghoul-leather-vest",
  ]);
  for (const model of models) {
    expect(model.sourceUrl, model.itemId).toBe("/Dungeon-Shop-Master/assets/models/"+model.itemId+".glb");
    expect(model.vertices, model.itemId).toBeGreaterThan(20);
    expect(model.triangles, model.itemId).toBeGreaterThan(10);
    expect(model.hasVertexPaint, model.itemId).toBe(true);
    expect(model.pickable, model.itemId).toBe(false);
    expect(model.collisions, model.itemId).toBe(false);
    expect(model.size.every(value => value > 0), model.itemId).toBe(true);
  }
  // No coal.glb is required; coal and iron ore are acquired at the
  // staffed adventurer buyback counter, never displayed on shelves.
  // The browser loaded each source GLB into the render templates above.
  // Independently verify binary files in the checkout, not the SPA fallback.
  for(const item of models){
    const bytes=await readFile(new URL(
      "../public/assets/models/"+item.itemId+".glb",import.meta.url));
    expect(bytes.toString("ascii",0,4)).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const jsonBytes=bytes.readUInt32LE(12);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a); // JSON chunk
    const model=JSON.parse(bytes.toString("utf8",20,20+jsonBytes));
    expect(model.asset?.version).toBe("2.0");
    expect(model.meshes?.length,item.itemId+" geometry").toBeGreaterThan(0);
  }
  expect(pageErrors).toEqual([]);
});

test("actual stocked shelf meshes follow saved quantities for real shop goods @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // A world-clock autosave is queued on boot and again after reload.
  // Seed via a different CampaignStorage ONLY once the app has finished its
  // own queued write. Pause live time so the next 20-tick autosave cannot
  // race the explicit stock fixture and replace its saved quantities.
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void;
  }).__shopTestPauseWorld?.(true));
  await expect(page.locator("#save-status")).toHaveText(
    /^(Saved Day 1\.|Continued saved Day 1\.)$/);
  // Check the REAL shop-rendered meshes, not merely geometry created by a
  // factory inside a test. Two persisted four-slot inventories cover 6 items.
  const seed=(ids:readonly (string|null)[],counts:readonly number[])=>
    page.evaluate(async({ids,counts})=>{
      const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
      const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
      const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
      const {ITEMS}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
      const storage=new CampaignStorage();
      const existing=await storage.loadGame();
      const base=existing?.shopLayout.shelves.length?existing:
        withStockedSmallShelf(createGameState(97319));
      const valid=new Set<string>(ITEMS.map(item=>item.id));
      const slots=base.shopEconomy.slots.map((slot,index)=>{
        const id=ids[index];
        return {...slot,itemId:id&&valid.has(id)
          ?id as typeof slot.itemId:null,quantity:counts[index]??0};
      });
      await storage.saveGame({...base,
        // Keep autonomous buyers out of this exact-quantity visual fixture.
        // Actual shopping and unpaid-cart conservation have separate tests.
        adventurers:base.adventurers.map(hero=>({...hero,
          status:"exploring" as const,floor:4 as const,shopStayDays:0})),
        shopCarts:[],
        shopEconomy:{...base.shopEconomy,slots}});
    },{ids,counts});
  const inspect=()=>page.evaluate(async()=>{
    const scene=await import("/Dungeon-Shop-Master/tests/scene.ts");
    await scene.waitForShopStockAssets();
    return scene.inspectRenderedShopStock("shelf-1");
  });
  await seed(["healing-herb","mana-potion","bread","iron-sword"],[3,1,5,2]);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  // A world-clock autosave is queued on boot and again after reload.
  // Seed via a different CampaignStorage ONLY once the app has finished its
  // own queued write. Pause live time so the next 20-tick autosave cannot
  // race the explicit stock fixture and replace its saved quantities.
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void;
  }).__shopTestPauseWorld?.(true));
  await expect(page.locator("#save-status")).toHaveText(
    /^(Saved Day 1\.|Continued saved Day 1\.)$/);
  let shown=await inspect();
  expect(shown.map(slot=>slot.units)).toEqual([3,1,5,2]);
  for(const slot of shown){
    expect(slot.padPresent&&slot.padPickable&&slot.padCollision).toBe(true);
    expect(slot.modelsPickable||slot.modelsCollision).toBe(false);
    expect(slot.modelsColor).toBe(true);
    expect(slot.modelVertices.every(count=>count>20)).toBe(true);
  }
  await seed(["iron-sword","leather-vest",null,null],[2,4,0,0]);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  // A world-clock autosave is queued on boot and again after reload.
  // Seed via a different CampaignStorage ONLY once the app has finished its
  // own queued write. Pause live time so the next 20-tick autosave cannot
  // race the explicit stock fixture and replace its saved quantities.
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void;
  }).__shopTestPauseWorld?.(true));
  await expect(page.locator("#save-status")).toHaveText(
    /^(Saved Day 1\.|Continued saved Day 1\.)$/);
  shown=await inspect();
  expect(shown.map(slot=>slot.units)).toEqual([2,4,0,0]);
  expect(shown.every(slot=>slot.padPickable&&slot.padCollision)).toBe(true);
  expect(shown.every(slot=>!slot.modelsPickable&&!slot.modelsCollision)).toBe(true);
  expect(errors).toEqual([]);
});

test("Shift-click stocks and clears the aimed physical shelf using real GLBs",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  // Finish the initial autosave before another storage instance seeds the shelf.
  // Otherwise its pending empty-shop write can overwrite this browser fixture.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const state=withStockedSmallShelf(createGameState(97319));
    await new CampaignStorage().saveGame({...state,
      adventurers:state.adventurers.map(hero=>({...hero,
        status:"exploring" as const,floor:4 as const,shopStayDays:0}))});
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const scene=await import("/Dungeon-Shop-Master/tests/scene.ts");
    await scene.waitForShopStockAssets();
    await scene.waitForShelfSlotMesh();
    scene.aimAtShelfSlot();
  });
  await page.keyboard.press("Tab");
  await page.locator('#inventory-dialog [data-bag-item="healing-herb"] .bag-item-pick').dragTo(page.locator('#inventory-dialog [data-bind-slot="1"]'));
  await page.keyboard.press("Tab");
  await page.keyboard.press("1");
  await expect(page.locator("#shop-shelf-focus")).toBeVisible();
  await expect(page.locator("#shelf-focus-action")).toContainText("Shift+left-click: fill slot");
  await page.keyboard.down("Shift");
  await page.mouse.click(400,300);
  await page.keyboard.up("Shift");
  await expect(page.locator("#status")).toContainText("Placed 5 Healing Herb");
  await expect(page.locator("#shelf-focus-title")).toContainText("5/5");
  let result=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectRenderedShopStock("shelf-1"));
  expect(result[0].units).toBe(5);
  expect(result[0].modelsPickable||result[0].modelsCollision).toBe(false);
  await expect(page.locator(".inventory-row").filter({hasText:"Healing Herb"}).locator("strong")).toHaveText("0");
  await page.keyboard.down("Shift");
  await page.mouse.click(400,300,{button:"right"});
  await page.keyboard.up("Shift");
  await expect(page.locator("#status")).toContainText("Returned 5 Healing Herb");
  await expect(page.locator(".inventory-row").filter({hasText:"Healing Herb"}).locator("strong")).toHaveText("5");
  result=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectRenderedShopStock("shelf-1"));
  expect(result[0].units).toBe(0);
  expect(result[0].padPickable&&result[0].padCollision).toBe(true);
  expect(errors).toEqual([]);
});
