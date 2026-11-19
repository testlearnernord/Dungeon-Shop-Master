import {expect,test} from "@playwright/test";

test("two-day expedition timeline is available from shop and Board, never an infinite archive @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-archive").click();
  const dialog=page.locator("#archive-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#archive-day-filter")).toHaveValue("1");
  await expect(dialog.locator("#archive-summary")).toContainText("real highlights");
  await expect(dialog.locator(".archive-entry").first()).toBeVisible();
  await dialog.locator("#archive-day-filter").selectOption("saved");
  await expect(dialog.locator("#archive-entries")).toContainText("No saved recordings");
  await page.locator("#archive-close").click();
  await expect(dialog).toBeHidden();
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await page.locator("#open-archive-roster").click();
  await expect(page.locator("#roster-dialog")).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.locator("#archive-close").click();
  expect(errors).toEqual([]);
});

test("cashier stamp uses visible needle even after a long blocked frame @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const before=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  expect(before.openResult).toContain("Register ready");
  await expect(page.locator("#cashier-overlay")).toBeVisible();
  await page.evaluate(async()=>new Promise<void>((resolve,reject)=>{
    let frames=0;
    const sample=()=>{
      const root=document.querySelector("#cashier-overlay")!;
      const needle=root.querySelector<HTMLElement>(".cashier-needle")!;
      const mark=root.querySelector<HTMLElement>(".cashier-target")!;
      const stamp=root.querySelector<HTMLButtonElement>(".cashier-stamp")!;
      const displayed=parseFloat(needle.style.left);
      const center=parseFloat(mark.style.left)+parseFloat(mark.style.width)/2;
      if(Math.abs(displayed-center)<3){
        // Simulate low-FPS main-thread work after the last visible frame.
        // The old perf.now() evaluation jumped to an unseen position.
        const until=performance.now()+570;
        while(performance.now()<until){ /* forced render stall */ }
        stamp.click();
        resolve();
      }else if(frames++>350)reject(new Error("Needle never crossed stamp mark"));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await expect(page.locator("#cashier-overlay .cashier-stage-name"))
    .toHaveText("Seal the receipt");
  const after=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .inspectCashierHarness());
  expect(after.manualReceipts).toBe(0,"First stamp cannot charge the customer");
  await page.keyboard.press("Escape");
  await expect(page.locator("#cashier-overlay")).toBeHidden();
  expect(errors).toEqual([]);
});
