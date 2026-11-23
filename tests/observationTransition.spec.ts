import {expect,test} from "@playwright/test";

/** Real Babylon SHOP -> LIVE handoff, not a mocked director or synthetic
 * full-screen switch. World time is frozen only by the existing E2E flag. */
test("E at Galvik's Table enters the matching LIVE floor and restores FPS @ci-smoke",
  async({page},testInfo)=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world=1");
  await expect(page.locator("#day")).toHaveText("Day 1");

  const table=()=>page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    if(!helper.shopSceneReady())return null;
    helper.aimAtGalviksTable();
    return helper.inspectGalviksLiveTable();
  });
  await expect.poll(async()=>table(),{timeout:35000,
    intervals:[200,400,700]}).toMatchObject({
    dioramaEnabled:true,observedFloor:1,
  });
  await expect(page.locator("#observation-table-hint")).toBeVisible({
    timeout:12000,
  });
  const start=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer());
  await page.locator("#renderCanvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("body")).toHaveClass(/observation-transitioning/);
  await expect(page.locator("body")).toHaveClass(/dungeon-active/,{
    timeout:15000,
  });
  await expect(page.locator("body")).not.toHaveClass(
    /observation-transitioning/,{timeout:15000});
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("1");
  const camera=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonLayout().camera);
  expect(Math.abs(camera.x)).toBeLessThan(.1);
  expect(camera.z).toBeLessThan(-5);
  expect(camera.y).toBeGreaterThan(5);
  await testInfo.attach("table-entry-live-floor1",{
    body:await page.screenshot(),contentType:"image/png",
  });

  // The selected LIVE floor is remembered by the physical table after
  // closing. The next E must NOT flash a hard-coded Floor 1 during handoff.
  await page.locator("#dungeon-floor-select").selectOption("6");
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("6");
  await page.locator("#close-dungeon").click();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  const restored=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer());
  expect(restored.x).toBeCloseTo(start.x,4);
  expect(restored.y).toBeCloseTo(start.y,4);
  expect(restored.z).toBeCloseTo(start.z,4);
  expect(restored.gravity).toBe(start.gravity);
  expect(restored.collisions).toBe(start.collisions);

  await expect.poll(async()=>table(),{timeout:35000,
    intervals:[200,400,700]}).toMatchObject({
    dioramaEnabled:true,observedFloor:6,
  });
  await expect(page.locator("#observation-table-hint")).toBeVisible();
  await page.locator("#renderCanvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("body")).toHaveClass(/dungeon-active/,{
    timeout:15000,
  });
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("6");
  await expect(page.locator("body")).not.toHaveClass(
    /observation-transitioning/,{timeout:15000});
  await testInfo.attach("table-entry-live-floor6",{
    body:await page.screenshot(),contentType:"image/png",
  });
  await page.locator("#close-dungeon").click();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  expect(errors).toEqual([]);
});
