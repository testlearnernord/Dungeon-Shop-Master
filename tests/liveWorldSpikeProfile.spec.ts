import {expect,test,type Page} from "@playwright/test";

type TimedEvent={
  durationMs:number;advanced:number;eventsAdded:number;
  pendingBefore:number;pendingAfter:number;activeCombats:number;
  heroes:number;day:number;
};
type Sample={
  readonly medianMs:number;
  readonly p95Ms:number;
  readonly worstMs:number;
  readonly frames:number;
};
async function sampleFrames(page:Page,count=48):Promise<Sample>{
  return page.evaluate((wanted)=>new Promise<Sample>(resolve=>{
    const gaps:number[]=[];
    let last=0;
    const tick=(now:number)=>{
      if(last>0)gaps.push(now-last);
      last=now;
      if(gaps.length===wanted){
        const ordered=[...gaps].sort((a,b)=>a-b);
        const percentile=(p:number)=>ordered[
          Math.min(ordered.length-1,Math.floor((ordered.length-1)*p))];
        resolve({medianMs:percentile(.5),p95Ms:percentile(.95),
          worstMs:ordered.at(-1)!,frames:gaps.length});
      }else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }),count);
}
async function benchmarkWorld(page:Page,label:string){
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void;
    __shopTestReadProfile?:()=>unknown;
  }).__shopTestPauseWorld?.(true));
  const paused=await sampleFrames(page);
  const events=await page.evaluate(()=>{
    const hook=(window as Window&{
      __shopTestTimedWorldAdvance?:(ticks:number)=>TimedEvent;
    }).__shopTestTimedWorldAdvance;
    if(!hook)throw Error("Missing actual world-clock event CPU probe");
    const bursts:TimedEvent[]=[];
    for(let step=0;step<6;step++)bursts.push(hook(600));
    return bursts;
  });
  const pausedAfterEvents=await sampleFrames(page);
  await page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestPauseWorld?:(paused:boolean)=>void;
      __shopTestReadProfile?:()=>unknown;
    };
    hooks.__shopTestReadProfile?.();
    hooks.__shopTestPauseWorld?.(false);
  });
  const live=await sampleFrames(page);
  const cpu=await page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestPauseWorld?:(paused:boolean)=>void;
      __shopTestReadProfile?:()=>unknown;
    };
    hooks.__shopTestPauseWorld?.(true);
    return hooks.__shopTestReadProfile?.();
  });
  return {label,paused,pausedAfterEvents,live,events,cpu};
}

test("day-one versus day-eleven real dungeon events and live/paused shop render costs @ci-smoke",async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Preserve the existing seeded ten-hero runtime population and use its
  // actual saved event executor; never invent isolated combat workloads.
  const day1=await benchmarkWorld(page,"day-1");
  expect(day1.events.every(e=>e.advanced===600)).toBe(true);
  expect(day1.events.some(e=>e.pendingBefore>0)).toBe(true);

  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    await new CampaignStorage().saveGame(
      createGameState(7351,{dailyInflux:0,maxActive:10}));
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestPauseWorld?:(paused:boolean)=>void;
      __shopTestAdvanceDay?:()=>void;
    };
    hooks.__shopTestPauseWorld?.(true);
    if(!hooks.__shopTestAdvanceDay)throw Error("Missing genuine bed-close hook");
    for(let day=2;day<=11;day++)hooks.__shopTestAdvanceDay();
  });
  await expect(page.locator("#day")).toHaveText("Day 11");
  const day11=await benchmarkWorld(page,"day-11");
  expect(day11.events.every(e=>e.advanced===600)).toBe(true);
  expect(day11.events.every(e=>e.day===11)).toBe(true);
  expect(day11.events.some(e=>e.pendingBefore>0)).toBe(true);

  // The result is attribution, not a shaky performance threshold on a
  // shared virtual software GL runner. Compare per-scenario data in logs.
  console.log("[PR217 LIVE EVENT HOTSPOT / SwiftShader CI / real Day 1 and 11]",
    JSON.stringify({day1,day11}));
  expect(errors).toEqual([]);
});
