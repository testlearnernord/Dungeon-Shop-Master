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
  await page.keyboard.down("w");
  await page.waitForTimeout(2200);
  await page.keyboard.up("w");
  const after=await page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return {player:helper.inspectPlayer(),hits:helper.inspectCellarCollisions()};
  });
  console.log("Cellar descent diagnostic",JSON.stringify(after));
  expect(after.player.z).toBeLessThan(-20.0);
  expect(after.player.y).toBeLessThan(-2.4);
  // Re-aim UP the actual staircase and walk back through the same door.
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimUpCellarStairs());
  await page.keyboard.down("w");
  await page.waitForTimeout(2200);
  await page.keyboard.up("w");
  const returned=await page.evaluate(async()=>{
    const {inspectPlayer}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return inspectPlayer();
  });
  console.log("Cellar return diagnostic",JSON.stringify(returned));
  expect(returned.z).toBeGreaterThan(-12.2);
  expect(returned.y).toBeGreaterThan(.75);
  expect(errors).toEqual([]);
});
