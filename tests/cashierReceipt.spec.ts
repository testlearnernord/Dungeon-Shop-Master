import {expect,test} from "@playwright/test";

/** Complete both timing actions by clicking only when the on-screen marker
 * actually overlaps the highlighted success zone. No mocked payment API. */
async function stampAtMarker(page:import("@playwright/test").Page):Promise<boolean>{
  return page.evaluate(async()=>{
    return await new Promise<boolean>(resolve=>{
      let frames=0;
      const stamp=()=>{
        const needle=document.querySelector<HTMLElement>("#cashier-overlay .cashier-needle");
        const target=document.querySelector<HTMLElement>("#cashier-overlay .cashier-target");
        const button=document.querySelector<HTMLButtonElement>("#cashier-overlay .cashier-stamp");
        if(!needle||!target||!button)return resolve(false);
        const position=parseFloat(needle.style.left);
        const center=parseFloat(target.style.left)+parseFloat(target.style.width)/2;
        if(Math.abs(position-center)<4){
          button.click();
          resolve(true);
        }else if(frames++>340)resolve(false);
        else requestAnimationFrame(stamp);
      };
      requestAnimationFrame(stamp);
    });
  });
}

test("the register verifies goods, seals receipt and only then transfers gold",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const start=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  expect(start.openResult).toContain("Register ready");
  expect(start.carts).toBe(1);
  expect(start.manualReceipts).toBe(0);
  const dialog=page.locator("#cashier-overlay");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Verify the goods");
  await expect(dialog.locator(".cashier-line")).toContainText("Waybread");
  await expect(dialog.locator(".cashier-total")).toContainText("4g");
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Seal the receipt");
  await expect(dialog.locator(".cashier-progress [data-stage='0']")).toHaveClass(/is-complete/);
  const halfway=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(halfway.gold).toBe(start.gold);
  expect(halfway.balance).toBe(start.balance);
  expect(halfway.carts).toBe(1);
  expect(halfway.manualReceipts).toBe(0);
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog).toBeHidden();
  const finished=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(finished.manualReceipts).toBe(1);
  expect(finished.carts).toBe(0);
  expect(finished.gold).toBeLessThan(start.gold);
  expect(finished.balance).toBeGreaterThan(start.balance);
  expect(finished.report).toContain("Receipt verified and sealed.");
  expect(errors).toEqual([]);
});

test("canceling a cashier session does not pay, clear or alter an unpaid cart",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const start=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  await expect(page.locator("#cashier-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#cashier-overlay")).toBeHidden();
  const after=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(after.carts).toBe(1);
  expect(after.gold).toBe(start.gold);
  expect(after.balance).toBe(start.balance);
  expect(after.manualReceipts).toBe(0);
});
