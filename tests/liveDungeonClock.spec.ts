import {test,expect} from "@playwright/test";
import type {GameState} from "../src/game/gameState.ts";

test("live dungeon advances shared floor positions before bed and resumes after reload @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(()=>{
    const hooks=window as Window&{__shopTestAdvanceDungeonTick?:()=>void};
    if(!hooks.__shopTestAdvanceDungeonTick)
      throw new Error("Missing authentic in-day expedition event hook");
    hooks.__shopTestAdvanceDungeonTick();
  });
  const stepTicks=await page.evaluate(async()=>(await import(
    "/Dungeon-Shop-Master/src/game/liveDungeonRuntime.ts")).DUNGEON_STEP_INTERVAL_TICKS);
  const current=await page.evaluate(async(stepTicks)=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const storage=new CampaignStorage();
    for(let i=0;i<30;i++){
      const state=await storage.loadGame();
      if(state?.liveDungeon.lastStepTick>=stepTicks)return state;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error("The real live dungeon step was not saved");
  },stepTicks) as GameState;
  expect(current.day).toBe(1);
  expect(current.worldClock.tick).toBeGreaterThanOrEqual(stepTicks);
  expect(current.liveDungeon.enabled).toBe(true);
  expect(current.liveDungeon.lastStepTick).toBe(stepTicks);
  expect(current.earlyDungeonWorlds?.some(x=>x.world.heroes.length>0)).toBe(true);
  expect(current.events.filter(e=>e.type==="dungeon-exploration")).toHaveLength(0);
  expect(current.worldClock.pending.filter(e=>e.lane==="expedition")).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const resumed=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(resumed?.liveDungeon).toEqual(current.liveDungeon);
  expect(resumed?.earlyDungeonWorlds).toEqual(current.earlyDungeonWorlds);
  await page.evaluate(()=>{
    const hooks=window as Window&{__shopTestAdvanceDungeonTick?:()=>void};
    hooks.__shopTestAdvanceDungeonTick?.();
  });
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.liveDungeon.lastStepTick??-1;
  }),{timeout:10000}).toBeGreaterThan(current.liveDungeon.lastStepTick);
  expect(errors).toEqual([]);
});
