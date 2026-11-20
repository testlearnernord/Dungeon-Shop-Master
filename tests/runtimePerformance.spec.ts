import {expect,test} from "@playwright/test";

interface FrameSample {
  readonly count:number;
  readonly p50Ms:number;
  readonly p95Ms:number;
  readonly worstMs:number;
  readonly slowFrames:number;
}
/** A telemetry sample, NOT a promise about the player's GPU or display.
 * Headless CI often uses software GL and synthetic virtualized resources.
 */
async function sampleAnimationFrames(page:import("@playwright/test").Page,
  count=36):Promise<FrameSample>{
  return page.evaluate((wanted)=>new Promise<FrameSample>((resolve)=>{
    const durations:number[]=[];
    let previous=0;
    const frame=(now:number)=>{
      if(previous>0)durations.push(now-previous);
      previous=now;
      if(durations.length>=wanted){
        const ordered=[...durations].sort((a,b)=>a-b);
        const percentile=(p:number)=>ordered[
          Math.min(ordered.length-1,Math.floor(p*(ordered.length-1)))];
        resolve({count:durations.length,p50Ms:percentile(.5),
          p95Ms:percentile(.95),worstMs:ordered.at(-1)!,
          slowFrames:durations.filter(ms=>ms>50).length});
      }else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }),count);
}

test("world-only clocks never rerender level-6 history; cashier leaves Babylon idle while DOM input keeps drawing @ci-smoke",async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const renders=await page.evaluate(()=>{
    const fn=(window as Window&{__shopTestExpeditionRenders?:()=>number})
      .__shopTestExpeditionRenders;
    if(!fn)throw Error("Missing E2E-only expedition render counter");
    return fn();
  });
  const clock=await page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestPauseWorld?:(paused:boolean)=>void;
      __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
      __shopTestTraffic?:()=>{tick:number};
      __shopTestExpeditionRenders?:()=>number;
    };
    hooks.__shopTestPauseWorld?.(true);
    const beforeTick=hooks.__shopTestTraffic?.().tick;
    hooks.__shopTestAdvanceWorldTicks?.(25);
    const tick=hooks.__shopTestTraffic?.().tick;
    const rendered=hooks.__shopTestExpeditionRenders?.();
    hooks.__shopTestPauseWorld?.(false);
    return {beforeTick,tick,rendered};
  });
  expect(clock.tick! - clock.beforeTick!).toBe(25);
  expect(clock.rendered).toBe(renders,
    "Moving the shared world clock alone cannot scan the event log and redraw Level-6 DOM");

  const shopFrames=await sampleAnimationFrames(page);
  expect(shopFrames.count).toBe(36);
  expect(shopFrames.p50Ms).toBeGreaterThan(0);
  expect(shopFrames.p95Ms).toBeGreaterThanOrEqual(shopFrames.p50Ms);

  await page.evaluate(async()=>{
    const {openCashierHarness}=await import("/Dungeon-Shop-Master/tests/cashierHarness.ts");
    const opened=openCashierHarness();
    if(!opened.openResult.includes("Register ready"))
      throw Error("The real cashier harness did not admit a customer");
  });
  await expect(page.locator("#cashier-overlay")).toBeVisible();
  // The global world/3D render must stay frozen while the separate cashier
  // needle and button keep their own DOM requestAnimationFrame updates.
  const frameBefore=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer().frame);
  const cashierFrames=await sampleAnimationFrames(page);
  const frameAfter=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer().frame);
  expect(frameAfter).toBe(frameBefore,
    "Babylon must not render the hidden 3D scene during cashier input");
  expect(cashierFrames.count).toBe(36);
  expect(cashierFrames.p50Ms).toBeGreaterThan(0);
  expect(cashierFrames.p95Ms).toBeGreaterThanOrEqual(cashierFrames.p50Ms);
  await expect(page.locator(".cashier-needle")).toHaveAttribute("style",/left:/);
  const print=(sample:FrameSample)=>({
    median:Math.round(sample.p50Ms*10)/10,
    p95:Math.round(sample.p95Ms*10)/10,
    worst:Math.round(sample.worstMs*10)/10,
    over50ms:sample.slowFrames,
  });
  console.log("[PR214 browser RAF sample, virtual CI hardware, ms]",JSON.stringify({
    shop:print(shopFrames),cashier:print(cashierFrames),
  }));
  await page.keyboard.press("Escape");
  await expect(page.locator("#cashier-overlay")).toBeHidden();
  expect(errors).toEqual([]);
});
