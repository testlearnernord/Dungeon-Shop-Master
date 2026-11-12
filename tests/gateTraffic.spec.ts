import {expect,test} from "@playwright/test";
import {advanceTestDay} from "./advanceTestDay";

/**
 * Reproduce simultaneous fresh arrivals and shop departures across day ticks.
 * In the 2.4m Level 4 approach they must not be admitted in opposite
 * directions at once. Full gameplay and real browser actor movement are used;
 * no fabricated DOM customer models or manually advanced transforms.
 */
test("level 4 gate queues opposing customers without head-on jams",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const snapshot=async()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals().visitors
      .filter(v=>v.gateSide==="level4"&&(v.phase==="entering"||v.phase==="leaving"))
      .map(v=>({id:v.id,phase:v.phase,x:v.x,z:v.z,
        yielding:v.gateYield===true,blocked:v.blockedSeconds??0})));
  await page.waitForTimeout(7300);
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.waitForTimeout(1000);
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 3");
  const observations:Awaited<ReturnType<typeof snapshot>>[]=[];
  for(let sample=0;sample<52;sample++){
    const visitors=await snapshot();
    observations.push(visitors);
    const inGate=visitors.filter(v=>v.z>6.18&&v.z<12.84&&
      Math.abs(v.x+4)<1.7);
    const directions=new Set(inGate.map(v=>v.phase));
    expect(directions.size,
      "opposing Level 4 streams entered the same narrow corridor").toBeLessThanOrEqual(1);
    await page.waitForTimeout(220);
  }
  const all=observations.flat();
  expect(all.some(v=>v.z>6.18&&v.z<12.84)).toBe(true);
  // A right-of-way wait must never pin someone in the center of the passage.
  expect(all.filter(v=>v.yielding).every(v=>
    v.phase==="entering"?v.z>=12.84:
      v.z<=6.16&&v.z>=4.45)).toBe(true);
  expect(errors).toEqual([]);
});
