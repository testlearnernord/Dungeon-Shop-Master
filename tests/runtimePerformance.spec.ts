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


test("PR215 forensic profile: compare the SAME scene with and without real 50ms world work @ci-smoke",async({page})=>{
  test.setTimeout(120000);
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=async(paused:boolean)=>{
    await page.evaluate(on=>{
      const hooks=window as Window&{
        __shopTestPauseWorld?:(paused:boolean)=>void;
        __shopTestReadProfile?:()=>Record<string,{ms:number;calls:number;maxMs:number}>;
      };
      if(!hooks.__shopTestReadProfile||!hooks.__shopTestPauseWorld)
        throw Error("Missing E2E-only profiling hooks");
      hooks.__shopTestPauseWorld(on);
      hooks.__shopTestReadProfile();
    },paused);
    const frames=await sampleAnimationFrames(page,60);
    const profile=await page.evaluate(()=>
      (window as Window&{__shopTestReadProfile?:()=>unknown})
        .__shopTestReadProfile?.());
    return {frames,profile};
  };
  const idle=await inspect(true);
  const live=await inspect(false);
  const save=await page.evaluate(async()=>{
    const {CampaignStorage,createSave,parseSave,serializeSave}=
      await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const storage=new CampaignStorage();
    const state=await storage.loadGame();
    if(!state)throw Error("No authentic campaign persisted");
    const t1=performance.now();
    const payload=serializeSave(state);
    const t2=performance.now();
    parseSave(payload);
    const t3=performance.now();
    const clone=JSON.stringify(createSave(state));
    const t4=performance.now();
    return {bytes:payload.length,serializeMs:t2-t1,parseValidateMs:t3-t2,
      legacyCloneMs:t4-t3,identicalPayload:
        JSON.stringify(JSON.parse(clone).payload)===
        JSON.stringify(JSON.parse(payload).payload)};
  });
  await page.evaluate(()=>
    (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
      .__shopTestPauseWorld?.(false));
  console.log("[PR215 BEFORE/AFTER clock CPU baseline, CI virtual GPU]",JSON.stringify({
    idle,live,save,
  }));
  expect(idle.profile).toBeTruthy();
  expect(live.profile).toBeTruthy();
  expect((live.profile as Record<string,{calls:number}>)["world-step"]?.calls)
    .toBeGreaterThan(0);
  expect((live.profile as Record<string,{calls:number}>)["traffic-validate-notify"]?.calls)
    .toBeGreaterThan(0);
});

test("F3 diagnostics are opt-in and expose real browser frame and autosave costs @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  await page.goto("./");
  await expect(page.locator("#runtime-performance")).toBeHidden();
  await page.keyboard.press("F3");
  await expect(page.locator("#runtime-performance")).toBeVisible();
  await expect(page.locator("#runtime-performance")).toContainText("FPS (frame gap)",{
    timeout:20000,
  });
  await expect(page.locator("#runtime-performance")).toContainText("Render CPU / frame");
  await expect(page.locator("#runtime-performance")).toContainText("autosave");
  await page.keyboard.press("F3");
  await expect(page.locator("#runtime-performance")).toBeHidden();
});

test("smooth shop presentation never commits fractional NPC positions to save/physics @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const sawMovement=await expect.poll(async()=>page.evaluate(()=>{
    const hook=(window as Window&{
      __shopTestPresentAt?:(fraction:number)=>{
        before:{actors:{heroId:string;x:number;z:number;yaw:number}[]};
        during:{actors:{heroId:string;x:number;z:number;yaw:number}[]};
        after:{actors:{heroId:string;x:number;z:number;yaw:number}[]};
      };
    }).__shopTestPresentAt;
    if(!hook)throw Error("Missing actual-world presentation hook");
    const {before,during,after}=hook(.5);
    if(JSON.stringify(before)!==JSON.stringify(after))
      throw Error("Temporary display changes leaked into the physical shop motor");
    const byId=new Map(during.actors.map(actor=>[actor.heroId,actor]));
    return before.actors.some(actor=>{
      const shown=byId.get(actor.heroId);
      return shown&&Math.hypot(shown.x-actor.x,shown.z-actor.z)>1e-4;
    });
  }),{timeout:20000,intervals:[100,150,250]}).toBe(true);
  // The returned matcher itself enforces a frame with genuine interpolation.
  expect(sawMovement).toBeUndefined();
});

test("F4 quality presets change the actual Babylon render buffer, never the HTML UI @ci-smoke",async({page})=>{
  test.setTimeout(60000);
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const info=()=>page.evaluate(()=>{
    const read=(window as Window&{
      __shopTestRenderQualityInfo?:()=>{mode:string;scale:number;
        width:number;height:number;renderer:string};
    }).__shopTestRenderQualityInfo;
    if(!read)throw Error("Missing actual render quality E2E hook");
    return read();
  });
  const canvas=page.locator("#renderCanvas");
  const cssBefore=await canvas.evaluate(element=>({
    width:element.getBoundingClientRect().width,
    height:element.getBoundingClientRect().height,
  }));
  const full=await info();
  expect(full.mode).toBe("auto");
  expect(full.scale).toBe(1);
  await page.keyboard.press("F4");
  expect((await info()).mode).toBe("native");
  await page.keyboard.press("F4");
  const balanced=await info();
  expect(balanced.mode).toBe("balanced");
  expect(balanced.width).toBeLessThan(full.width);
  expect(balanced.height).toBeLessThan(full.height);
  await page.keyboard.press("F4");
  const performance=await info();
  expect(performance.mode).toBe("performance");
  expect(performance.scale).toBe(2);
  expect(performance.width).toBeLessThan(balanced.width);
  await page.keyboard.press("F3");
  await expect(page.locator("#runtime-performance")).toContainText("Render buffer:",{
    timeout:15000,
  });
  await expect(page.locator("#runtime-performance")).toContainText("GL:");
  await expect(page.locator("#runtime-performance")).toContainText("performance");
  const cssAfter=await canvas.evaluate(element=>({
    width:element.getBoundingClientRect().width,
    height:element.getBoundingClientRect().height,
  }));
  expect(cssAfter).toEqual(cssBefore,
    "Only internal Babylon pixels change; screen/HUD dimensions stay crisp");
  await page.keyboard.press("F4");
  expect((await info()).mode).toBe("auto");
  expect((await info()).scale).toBe(1);
});
