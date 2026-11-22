import {expect,test} from "@playwright/test";

/** Actual Babylon FPS integration: the secret portrait is picked by E,
 * the blocker changes collision, and Galvik walks down the same scene's ramp.
 * No game-store mutation or fake cellar teleport is used. */
test("portrait reveals a physical staircase to the mineable cellar @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtCellarPortrait());
  await page.keyboard.press("e");
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.cellarDoorOpen;
  }),{timeout:12000}).toBe(true);
  const gate=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCellarGate());
  expect(gate).toEqual({blocked:false,ramp:true,cellarFloor:true,chest:true});
  // Start at the actual upper stair landing and WALK downhill. The real FPS
  // camera must follow the slope, not be teleported to a second world.
  await page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    helper.aimAtCellarStairs();
    helper.trackCellarCollisions();
  });
  await page.locator("#renderCanvas").focus();
  const position=async()=>{
    return await page.evaluate(async()=>(
      await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer());
  };
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:12000,
      intervals:[250,300,350,400]}).toBeLessThan(-20.2);
  } finally {
    await page.keyboard.up("w");
  }
  const after=await page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return {player:helper.inspectPlayer(),hits:helper.inspectCellarCollisions()};
  });
  console.log("Cellar descent diagnostic",JSON.stringify(after));
  expect(after.player.y).toBeLessThan(-2.3);
  // Re-aim UP the same physical staircase and walk out past the secret door.
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimUpCellarStairs());
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:12000,
      intervals:[250,300,350,400]}).toBeGreaterThan(-12.0);
  } finally {
    await page.keyboard.up("w");
  }
  const returned=await position();
  console.log("Cellar return diagnostic",JSON.stringify(returned));
  expect(returned.y).toBeGreaterThan(.75);
  // Normal players approach slightly off-centre. They must not need pixel-
  // perfect alignment at the original 1.2m doorway.
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtCellarStairs(-.48));
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:9000,
      intervals:[250,300,350]}).toBeLessThan(-14.0);
  } finally {
    await page.keyboard.up("w");
  }
  expect(errors).toEqual([]);
});


test("Galvik's movable table projects the selected LIVE floor without leaving shop mode @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world=1");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtGalviksTable());
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectGalviksLiveTable());
  await expect.poll(async()=>await inspect(),{timeout:30000,intervals:[400,700,1000]})
    .toMatchObject({
      insetExists:true,insetVisible:true,
      textureName:"galviks-table-live-floor-1",
      shopMode:true,inShopScene:true,
    });
  const first=await inspect();
  expect(first.shopCamera).toBeTruthy();

  // The LIVE viewer remains the sole owner of the selected floor. A return
  // to the shop must update the *same physical* inset, not open a second HUD.
  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-floor-select").selectOption("2");
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("2");
  await page.locator("#close-dungeon").click();
  await expect.poll(async()=>(await inspect()).textureName,{timeout:30000})
    .toBe("galviks-table-live-floor-2");
  const second=await inspect();
  expect(second).toMatchObject({
    insetVisible:true,shopCamera:first.shopCamera,
    shopMode:true,inShopScene:true,
  });
  expect(errors).toEqual([]);
});
