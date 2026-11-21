import {test,expect} from "@playwright/test";

/** The persistent pond uses real excavated tiles. The FPS interaction
 * opens a transient fishing overlay rather than a second simulation scene. */
test("mined pond reveals water and opens fishing by E @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateLevel5Cell}=await import("/Dungeon-Shop-Master/src/game/level5Room.ts");
    const {POND_CELLS}=await import("/Dungeon-Shop-Master/src/game/cellarPond.ts");
    const storage=new CampaignStorage(),state=await storage.loadGame();
    if(!state)throw Error("Missing campaign.");
    let room=state.cellarRoom;
    for(const cell of POND_CELLS){
      const dug=excavateLevel5Cell(room,cell);
      if(!dug.ok)throw Error(dug.reason);
      room=dug.room;
    }
    await storage.saveGame({...state,cellarRoom:room});
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const water=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFishingPond());
  expect(water).toEqual({exists:true,visible:true,pickable:true});
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFishingPond());
  await page.keyboard.press("e");
  await expect(page.locator("#fishing-hud")).toBeVisible();
  await page.locator("#fishing-cast").click();
  await expect.poll(()=>page.locator("#fishing-phase").textContent(),
    {timeout:7000}).toMatch(/Flick|Line cast/);
  // End without granting a fake catch. Esc must restore the real FPS camera.
  await page.keyboard.press("Escape");
  await expect(page.locator("#fishing-hud")).toBeHidden();
  const saved=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return await new CampaignStorage().loadGame();
  });
  expect(saved?.cellarFishCaught).toBe(0);
  expect(errors).toEqual([]);
});
