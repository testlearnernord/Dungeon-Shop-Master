import {expect,test} from "@playwright/test";
import type {ShopTrafficCheckpoint} from "../src/game/shopTraffic.ts";

test("physical NPC positions, routes, waits and claims survive reload at the same saved tick @ci-smoke",async({page})=>{
  test.setTimeout(100000);
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect.poll(()=>page.evaluate(()=>{
    const w=window as Window&{__shopTestTraffic?:()=>ShopTrafficCheckpoint};
    return w.__shopTestTraffic?.().tick??-1;
  }),{timeout:25000}).toBeGreaterThan(45);

  // The saved checkpoint must describe a real moving/queuing actor, rather
  // than a newly spawned visitor at an arbitrary entrance.
  const before=await page.evaluate(async()=>{
    const w=window as Window&{
      __shopTestPauseWorld?:(paused:boolean)=>void;
      __shopTestSaveTrafficNow?:()=>Promise<ShopTrafficCheckpoint>;
    };
    if(!w.__shopTestSaveTrafficNow||!w.__shopTestPauseWorld)
      throw new Error("Missing shop persistence E2E hooks.");
    w.__shopTestPauseWorld(true);
    return w.__shopTestSaveTrafficNow();
  });
  expect(before.initialized).toBe(true);
  expect(before.actors.length).toBeGreaterThan(0);
  expect(before.actors.some(actor=>actor.route.length>0||
    actor.phase==="queueing"||actor.phase==="considering")).toBe(true);

  // Verify the actual IndexedDB campaign has been serialized, not merely
  // the in-memory visual actor projection.
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const saved=await new CampaignStorage().loadGame();
    return saved?.shopTraffic.tick??-1;
  }),{timeout:12000}).toBe(before.tick);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");

  const hydrated=await page.evaluate(()=>{
    const w=window as Window&{__shopTestHydratedTraffic?:ShopTrafficCheckpoint};
    return w.__shopTestHydratedTraffic??null;
  });
  expect(hydrated,"The actual Babylon NPCs must be rebuilt from the saved checkpoint")
    .toEqual(before);
  const after=await page.evaluate(()=>{
    const w=window as Window&{__shopTestTraffic?:()=>ShopTrafficCheckpoint};
    return w.__shopTestTraffic?.()??null;
  });
  expect(after?.tick).toBeGreaterThanOrEqual(before.tick);
  await expect.poll(()=>page.evaluate(()=>{
    const w=window as Window&{__shopTestTraffic?:()=>ShopTrafficCheckpoint};
    return w.__shopTestTraffic?.().tick??-1;
  }),{timeout:15000}).toBeGreaterThan(before.tick+5);
  expect(pageErrors).toEqual([]);
});
