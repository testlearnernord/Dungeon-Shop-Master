import {expect,test} from "@playwright/test";
import type {GameState} from "../src/game/gameState.ts";

/** Real browser/store/IDB transition. The existing E2E bed shortcut calls
 * the game's original day-close function, NOT a parallel dungeon simulator.
 * The separate bed-hold test covers the physical player gesture itself.
 */
test("ten browser days retain one LIVE world, unique signals, bounded timeline and reloadable merchant history @ci-smoke",async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Keep this browser load bounded to the original ten named heroes while
  // still running all genuine spatial and physical world state transitions.
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    await new CampaignStorage().saveGame(
      createGameState(7351,{dailyInflux:0,maxActive:10}));
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Fixed boundary verification must not race the production 50ms wall-clock
  // pacer. Test-only pause leaves GameStore.endDay on its real live motor.
  await page.evaluate(()=>
    (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
      .__shopTestPauseWorld?.(true));

  async function loaded():Promise<GameState>{
    const result=await page.evaluate(async()=>{
      const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
      return new CampaignStorage().loadGame();
    });
    if(!result)throw Error("An acknowledged game save disappeared");
    return result as GameState;
  }
  let previousCount=0;
  for(let day=2;day<=11;day++){
    await page.evaluate(()=>{
      (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
        .__shopTestPauseWorld?.(true);
      const close=(window as Window&{__shopTestAdvanceDay?:()=>void}).__shopTestAdvanceDay;
      if(!close)throw Error("The genuine bed-close E2E hook is missing");
      close();
    });
    await expect(page.locator("#day")).toHaveText("Day "+day);
    await expect.poll(async()=>(await loaded()).day,{timeout:15000}).toBe(day);
    const state=await loaded();
    expect(state.liveDungeon.enabled).toBe(true);
    expect(state.worldClock.tick).toBe((day-1)*28800);
    expect(new Set(state.events.map(e=>e.id)).size).toBe(state.events.length);
    expect(state.adventurers.filter(h=>h.status!=="dead").length).toBeLessThanOrEqual(10);
    expect(state.shopCarts).toHaveLength(0);
    expect(state.events.filter(e=>e.type==="sale")).toHaveLength(0);
    expect(state.events.length).toBeGreaterThanOrEqual(previousCount);
    previousCount=state.events.length;
    if(day===6){
      await page.reload();
      await expect(page.locator("#day")).toHaveText("Day 6");
      await page.evaluate(()=>
        (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
          .__shopTestPauseWorld?.(true));
      const roundTrip=await loaded();
      expect(roundTrip).toEqual(state);
    }
  }
  const settled=await loaded();
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 11");
  await page.evaluate(()=>
    (window as Window&{__shopTestPauseWorld?:(paused:boolean)=>void})
      .__shopTestPauseWorld?.(true));
  expect(await loaded()).toEqual(settled);
  await page.locator("#open-archive").click();
  await expect(page.locator("#archive-dialog")).toBeVisible();
  await expect(page.locator("#archive-day-filter")).toHaveValue("11");
  // Historical FULL frames are never accumulated in an infinite gallery.
  await expect(page.locator("#archive-day-filter option")).toHaveCount(4);
  await page.locator("#archive-close").click();
  await expect(page.locator("#roster-dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
