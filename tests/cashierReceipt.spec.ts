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

test("the register verifies goods, seals receipt and only then transfers gold @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Both sides can see the register; only the staff side may operate it.
  const fromFront=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .openCashierHarness("customer"));
  expect(fromFront.openResult).toContain("Stand behind the counter");
  expect(fromFront.manualReceipts).toBe(0);
  const start=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  expect(start.openResult).toContain("Register ready");
  expect(start.carts).toBe(1);
  expect(start.manualReceipts).toBe(0);
  const dialog=page.locator("#cashier-overlay");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Verify the goods");
  await expect(dialog.locator(".cashier-line")).toContainText("Waybread");
  await expect(dialog.locator(".cashier-total")).toContainText("12g");
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
  await expect(dialog.locator(".cashier-settlement")).toBeVisible();
  await expect(dialog.locator(".cashier-settlement-amount"))
    .toContainText("13g collected");
  await expect(dialog.locator(".cashier-settlement-detail"))
    .toContainText("12g sale + 1g customer-funded tip");
  await expect(dialog.locator(".cashier-next")).toBeDisabled();
  const finished=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(finished.manualReceipts).toBe(1);
  expect(finished.tips).toBe(1);
  expect(finished.carts).toBe(0);
  expect(finished.gold).toBeLessThan(start.gold);
  expect(finished.balance).toBeGreaterThan(start.balance);
  expect(finished.report).toContain("Receipt verified and sealed.");
  // Payment does not force a pointer-lock modal roundtrip, but the player
  // can always exit the staffed register explicitly.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
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

test("a missed first stamp permits checkout but denies the flawless-service tip",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // The click occurs synchronously during creation, so the needle is still
  // at its leftmost starting position and definitely outside the success zone.
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness();
    document.querySelector<HTMLButtonElement>("#cashier-overlay .cashier-stamp")!.click();
  });
  const dialog=page.locator("#cashier-overlay");
  await expect(dialog.locator(".cashier-hint")).toContainText("tip forfeited");
  const afterMiss=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(afterMiss.carts).toBe(1);
  expect(afterMiss.manualReceipts).toBe(0);
  await page.waitForTimeout(280);
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Seal the receipt");
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog.locator(".cashier-settlement")).toBeVisible();
  await expect(dialog.locator(".cashier-settlement-amount"))
    .toContainText("12g collected");
  const settled=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).inspectCashierHarness());
  expect(settled.manualReceipts).toBe(1);
  expect(settled.tips).toBe(0);
  expect(settled.balance-settled.initialBalance).toBe(12);
  expect(settled.initialGold-settled.gold).toBe(12);
  expect(settled.report).toContain("No flawless-service tip.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("two customers are processed consecutively at one staffed register without auto-charging the next cart",async({page})=>{
  test.setTimeout(85000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  // The browser fixture uses Babylon's current scene; Vite can finish
  // navigation before the async campaign boot has created that scene.
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const start=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .openCashierHarness("staff",2));
  expect(start.carts).toBe(2);
  expect(start.manualReceiptsAll).toBe(0);
  const dialog=page.locator("#cashier-overlay");
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Verify the goods");
  await expect(dialog.locator(".cashier-item-icon")).toHaveCount(1);
  expect(await stampAtMarker(page)).toBe(true);
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog.locator(".cashier-settlement")).toBeVisible();
  const afterFirst=await page.evaluate(async()=>(
    (await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .inspectCashierHarness()));
  expect(afterFirst.manualReceiptsAll).toBe(1);
  expect(afterFirst.tipsAll).toBe(1);
  expect(afterFirst.carts).toBe(1);
  expect(afterFirst.balance-start.balance).toBe(13);
  await expect(dialog.locator(".cashier-next")).toBeEnabled();
  // Nothing happens to the second person's money just by presenting
  // their turn. E is an explicit new checkout, never an automatic payment.
  await page.keyboard.press("e");
  await expect(dialog.locator(".cashier-challenge")).toBeVisible();
  await expect(dialog.locator(".cashier-stage-name")).toHaveText("Verify the goods");
  await expect(dialog.locator(".cashier-customer"))
    .not.toHaveText(start.customer);
  const beforeSecond=await page.evaluate(async()=>(
    (await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .inspectCashierHarness()));
  expect(beforeSecond.manualReceiptsAll).toBe(1);
  expect(beforeSecond.carts).toBe(1);
  expect(beforeSecond.balance).toBe(afterFirst.balance);
  expect(await stampAtMarker(page)).toBe(true);
  expect(await stampAtMarker(page)).toBe(true);
  await expect(dialog.locator(".cashier-settlement")).toBeVisible();
  await expect(dialog.locator(".cashier-next")).toBeDisabled();
  const completed=await page.evaluate(async()=>(
    (await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .inspectCashierHarness()));
  expect(completed.manualReceiptsAll).toBe(2);
  expect(new Set(completed.paidCustomerIds).size).toBe(2);
  expect(completed.tipsAll).toBe(2);
  expect(completed.carts).toBe(0);
  expect(completed.balance-start.balance).toBe(26);
  await page.keyboard.press("e");
  await expect(dialog.locator(".cashier-settlement")).toBeVisible();
  const afterRedundantE=await page.evaluate(async()=>(
    (await import("/Dungeon-Shop-Master/tests/cashierHarness.ts"))
      .inspectCashierHarness()));
  expect(afterRedundantE.manualReceiptsAll).toBe(2);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("checkout stays non-modal and the authoritative shop traffic tick continues @ci-smoke",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const entry=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  expect(entry.openResult).toContain("Register ready");
  const overlay=page.locator("#cashier-overlay");
  await expect(overlay).toBeVisible();
  const initial=await page.evaluate(()=>{
    const hooks=window as Window&{__shopTestTraffic?:()=>{tick:number}};
    return {tick:hooks.__shopTestTraffic?.().tick??-1,
      modal:(document.querySelector("#cashier-overlay") as HTMLDialogElement).matches(":modal")};
  });
  expect(initial.modal).toBe(false);
  expect(initial.tick).toBeGreaterThanOrEqual(0);
  await expect.poll(async()=>page.evaluate(()=>{
    const hooks=window as Window&{__shopTestTraffic?:()=>{tick:number}};
    return hooks.__shopTestTraffic?.().tick??-1;
  }),{timeout:5000}).toBeGreaterThan(initial.tick+4);
  // The original timing semantics, cart and tip are still untouched.
  expect(await stampAtMarker(page)).toBe(true);
  expect(await stampAtMarker(page)).toBe(true);
  await expect(overlay.locator(".cashier-settlement")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
});

test("the cashier timer is drawn as an anchored bottom-screen brass ring",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/cashierHarness.ts")).openCashierHarness());
  const meter=page.locator("#cashier-overlay .cashier-meter");
  await expect(meter).toBeVisible();
  const geometry=await page.evaluate(()=>{
    const panel=document.querySelector<HTMLDialogElement>("#cashier-overlay")!;
    const meter=panel.querySelector<HTMLElement>(".cashier-meter")!;
    const p=panel.getBoundingClientRect(),m=meter.getBoundingClientRect();
    return {radius:getComputedStyle(meter).borderRadius,width:m.width,height:m.height,
      panelBottom:p.bottom,viewportHeight:window.innerHeight,
      start:meter.style.getPropertyValue("--success-start"),
      end:meter.style.getPropertyValue("--success-end")};
  });
  expect(geometry.radius).toBe("50%");
  expect(geometry.width).toBeGreaterThan(75);
  expect(Math.abs(geometry.width-geometry.height)).toBeLessThan(3);
  expect(geometry.start).toContain("deg");
  expect(geometry.end).toContain("deg");
  expect(geometry.panelBottom).toBeGreaterThan(geometry.viewportHeight*.5);
});
