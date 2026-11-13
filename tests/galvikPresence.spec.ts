import {expect,test} from "@playwright/test";

test("Galvik has grounded feet and unpickable animated first-person hands",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectGalvikBody());
  await expect.poll(async()=> (await inspect()).hands).toBe(2);
  const before=await inspect();
  expect(before.boots).toBe(2);
  expect(before.allUnpickable).toBe(true);
  expect(before.pickaxeVisible).toBe(false);
  expect(before.bodyVisible).toBe(true);
  expect(Math.abs((before.bodyHeight??0)-(before.cameraHeight??0))).toBeLessThan(.03);
  await page.keyboard.down("w");
  await page.waitForTimeout(550);
  const moving=await inspect();
  await page.keyboard.up("w");
  expect(moving.leftLegAngle).not.toBeNull();
  expect(moving.rightLegAngle).not.toBeNull();
  expect(moving.leftLegAngle).toBeCloseTo(-(moving.rightLegAngle??0),4);
  await expect.poll(async()=>Math.abs((await inspect()).leftLegAngle??1),
    {timeout:2500}).toBeLessThan(.001);
});
