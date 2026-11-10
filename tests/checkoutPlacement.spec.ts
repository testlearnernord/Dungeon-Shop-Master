import {expect,test} from "@playwright/test";

test("cashier uses the shelf placement editor: preview, cancel, rotate, save and reload",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCheckoutPlacement());
  const read=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  const original=await inspect();
  expect(original.counter?.z).toBeCloseTo(2.5,4);
  expect(original.counter?.collides).toBe(true);
  expect((await read())?.shopLayout.counter).toBeUndefined();

  await page.locator("#open-placement").click();
  await page.locator("#placement-shelf").selectOption("counter");
  await page.getByRole("button",{name:"↑ Back"}).click();
  await expect(page.locator("#placement-coordinates")).toContainText("Z 2.25");
  const preview=await inspect();
  expect(preview.counter?.z).toBeCloseTo(2.25,4);
  expect(preview.guide?.enabled).toBe(true);
  await page.locator("#placement-cancel").click();
  expect((await inspect()).counter?.z).toBeCloseTo(2.5,4);
  expect((await read())?.shopLayout.counter).toBeUndefined();

  await page.locator("#open-placement").click();
  await page.locator("#placement-shelf").selectOption("counter");
  await page.getByRole("button",{name:"↑ Back"}).click();
  await page.locator("#placement-rotate").click();
  await expect(page.locator("#placement-save")).toBeEnabled();
  await page.locator("#placement-save").click();
  await expect(page.locator("#shelf-placement")).toBeHidden();
  // Browser saves are asynchronous. Assert persistence only after the save commits.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const saved=await read();
  expect(saved?.shopLayout.counter).toEqual({x:0,z:2.25,rotation:1});
  expect(saved?.shopEconomy.slots).toHaveLength(10);
  const moved=await inspect();
  expect(moved.counter?.z).toBeCloseTo(2.25,4);
  expect(moved.counter?.rotation).toBeCloseTo(Math.PI/2,4);
  expect(moved.register?.rotation).toBeCloseTo(Math.PI/2,4);
  expect(moved.guide?.enabled).toBe(false);

  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 1.");
  const persisted=await inspect();
  expect(persisted.counter?.z).toBeCloseTo(2.25,4);
  expect(persisted.counter?.rotation).toBeCloseTo(Math.PI/2,4);
  expect((await read())?.shopLayout.counter).toEqual({x:0,z:2.25,rotation:1});
  expect(errors).toEqual([]);
});
