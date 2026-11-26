import {expect,test} from "@playwright/test";
test("Tettel is a real peaceful cellar Ghoul and work priorities survive reload @ci-smoke",async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect.poll(async()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const e=probe.inspectEmployee();
    return !!e?.ready&&e.enabled&&e.peaceful&&e.y< -4&&e.z< -20&&e.clip==="idle_combat";
  }),{timeout:90000}).toBe(true);
  await page.locator("#open-employees").click();
  const dialog=page.locator("#employee-dialog");
  await expect(dialog).toBeVisible();
  const cashier=dialog.getByLabel("Tettel Cashier priority");
  const restocking=dialog.getByLabel("Tettel Restocking priority");
  await expect(cashier).toHaveValue("0");
  await cashier.selectOption("1");await restocking.selectOption("4");
  await dialog.locator("#close-employees").click();
  await expect(dialog).toBeHidden();
  // Save cadence may defer a non-clock write; actual storage must observe it.
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.employees[0].priorities;
  }),{timeout:20000}).toEqual({cashier:1,restocking:4,charity:0});
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  await page.locator("#open-employees").click();
  await expect(cashier).toHaveValue("1");await expect(restocking).toHaveValue("4");
  expect(errors).toEqual([]);
});
