import { expect,test } from "@playwright/test";

test("visitors use exact projected need/stock/gold and travel toward the real shelf",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const original=createGameState(7351);
    const prepared={
      ...original,
      adventurers:original.adventurers.map((hero,index)=>
        index===0?{...hero,gold:100,inventory:{...hero.inventory,food:0},
          equipment:{weapon:null,armor:null}}:hero),
    };
    await new CampaignStorage().saveGame(prepared);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const visitorId=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())!.adventurers[0].id;
  });
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async()=>{
    const state=await inspect();
    return state.visitors.find(v=>v.id===visitorId)?.shoppingTargets??[];
  },{timeout:20000}).toContain("shelf-1-slot-2");
  const before=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  await expect.poll(async()=>{
    const visual=(await inspect()).visitors.find(v=>v.id===visitorId);
    return visual?.shoppingPhase;
  },{timeout:20000}).toBe("approaching-shelf");
  // The visitor heads toward the left shelf, instead of crossing to a random side.
  await expect.poll(async()=>{
    const visual=(await inspect()).visitors.find(v=>v.id===visitorId);
    return visual?.z??13;
  },{timeout:25000}).toBeLessThan(4);
  const mid=await inspect();
  const protagonist=mid.visitors.find(v=>v.id===visitorId)!;
  expect(protagonist.shoppingTargetSlot).toBe("shelf-1-slot-2");
  const after=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return new CampaignStorage().loadGame();
  });
  expect(after).toEqual(before); // Viewing a forecast is not a paid transaction.
  // Real sales still commit exactly once at the confirmed daily tick.
  await page.keyboard.press("n");
  await page.keyboard.press("z");
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const saved=await new CampaignStorage().loadGame();
    if(!saved?.events.some(event=>event.type==="sale"))
      throw Error("No authoritative day-tick receipt after projected visit");
  });
  expect(errors).toEqual([]);
});

test("visitors keep personal space while moving and never create gold merely by browsing",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  await expect.poll(async()=>(await inspect()).frame,{timeout:15000})
    .toBeGreaterThan(10);
  const samples=[];
  for(let i=0;i<5;i++){
    samples.push(await inspect());
    await page.waitForTimeout(400);
  }
  for(const sample of samples){
    const visitors=sample.visitors;
    for(let i=0;i<visitors.length;i++)for(let j=i+1;j<visitors.length;j++){
      const distance=Math.hypot(visitors[i].x-visitors[j].x,visitors[i].z-visitors[j].z);
      expect(distance).toBeGreaterThanOrEqual(1.0);
    }
  }
});
