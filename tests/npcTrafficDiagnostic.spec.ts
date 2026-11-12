import {test,expect} from "@playwright/test";
import {advanceTestDay} from "./advanceTestDay";

test("diagnose opening-hour NPC traffic without changing the simulation",async({page})=>{
  test.setTimeout(150000);
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const snapshot=async(label:string)=>{
    const data=await page.evaluate(async()=>(
      await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcTrafficDiagnostics());
    console.log("NPC-DIAG "+label+" "+JSON.stringify(data));
    return data;
  };
  await snapshot("day1-start");
  await page.waitForTimeout(12000);
  await snapshot("day1-12sec");
  await page.waitForTimeout(15000);
  await snapshot("day1-27sec");
  await advanceTestDay(page);
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 3");
  await snapshot("day3-start");
  await page.waitForTimeout(18000);
  await snapshot("day3-18sec");
  await page.screenshot({path:"npc-diagnostic/entrance.png"});
});
