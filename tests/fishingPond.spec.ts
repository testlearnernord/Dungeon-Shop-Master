import {test,expect} from "@playwright/test";

/** The persistent pond uses real excavated tiles. The FPS interaction
 * opens a transient fishing overlay rather than a second simulation scene. */
test("mined pond reveals water and opens fishing by E @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateLevel5Cell}=await import("/Dungeon-Shop-Master/src/game/level5Room.ts");
    const {POND_CELLS}=await import("/Dungeon-Shop-Master/src/game/cellarPond.ts");
    const storage=new CampaignStorage(),state=await storage.loadGame();
    if(!state)throw Error("Missing campaign.");
    let room=state.cellarRoom;
    for(const cell of POND_CELLS){
      const dug=excavateLevel5Cell(room,cell);
      if(!dug.ok)throw Error(dug.reason);
      room=dug.room;
    }
    await storage.saveGame({...state,cellarRoom:room});
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const water=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFishingPond());
  expect(water).toEqual({exists:true,visible:true,pickable:true});
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFishingPond());
  await page.keyboard.press("e");
  await expect(page.locator("#fishing-hud")).toBeVisible();
  const rodBefore=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFishingRod());
  expect(rodBefore).toMatchObject({
    rod:true,rodVisible:true,line:true,lineVisible:false,
    bobber:true,bobberVisible:false,sameScene:true,
  });
  const tickBefore=await page.evaluate(()=>{
    const hooks=window as Window&{__shopTestTraffic?:()=>{tick:number}};
    return hooks.__shopTestTraffic?.().tick??-1;
  });
  expect(tickBefore).toBeGreaterThanOrEqual(0);
  await expect.poll(async()=>page.evaluate(()=>{
    const hooks=window as Window&{__shopTestTraffic?:()=>{tick:number}};
    return hooks.__shopTestTraffic?.().tick??-1;
  }),{timeout:4000}).toBeGreaterThan(tickBefore+3);
  const hud=await page.evaluate(()=>{
    const frame=document.querySelector<HTMLElement>(".fishing-frame")!;
    const bounds=frame.getBoundingClientRect();
    return {bottom:bounds.bottom,height:bounds.height,
      viewport:window.innerHeight,
      mainSceneVisible:getComputedStyle(document.querySelector("#fishing-hud")!)
        .backgroundColor==="rgba(0, 0, 0, 0)"};
  });
  expect(hud.bottom).toBeGreaterThan(hud.viewport*.55);
  expect(hud.height).toBeLessThan(hud.viewport*.5);
  expect(hud.mainSceneVisible).toBe(true);
  // The gold goal has a fixed full-length marker, while the independent cyan
  // attempt starts at zero. Difficulty is the actual browser mouse delta,
  // not a short UI-only fake threshold.
  const presentation=await page.evaluate(()=>{
    const guide=document.querySelector<HTMLElement>(".fishing-aim-goal")!;
    const attempt=document.querySelector<HTMLElement>("#fishing-motion-ray")!;
    return {goldGoalWidth:guide.getBoundingClientRect().width,
      actualAttemptWidth:parseFloat(attempt.style.width),
      required:document.querySelector("#fishing-pull-distance")?.textContent,
      progress:document.querySelector<HTMLElement>("#fishing-pull-fill")?.style.width};
  });
  expect(presentation.goldGoalWidth).toBeGreaterThan(50);
  expect(presentation.goldGoalWidth).toBeLessThan(72);
  expect(presentation.actualAttemptWidth).toBe(0);
  expect(presentation.required).toBe("0 / 540 px");
  // Browsers normalize the CSS zero percentage as either "0%" or "0.0%".
  // The real contract is zero progress, not its string formatting.
  expect(Number.parseFloat(presentation.progress??"NaN")).toBe(0);
  await page.locator("#fishing-cast").click();
  await expect.poll(()=>page.locator("#fishing-phase").textContent(),
    {timeout:7000}).toMatch(/Flick|Line cast/);
  await expect.poll(()=>page.locator("#fishing-hud").getAttribute("data-phase"),
    {timeout:9000}).toBe("tracking");
  await expect(page.locator("#fishing-reel")).toBeVisible();
  await expect(page.locator("#fishing-reel-fish")).toBeVisible();
  // Two real browser mouse buttons must alternate to drive the green zone.
  await page.mouse.click(420,340,{button:"left"});
  await expect(page.locator("#fishing-click-cue")).toContainText("RIGHT CLICK");
  await page.mouse.click(420,340,{button:"right"});
  await expect(page.locator("#fishing-click-cue")).toContainText("LEFT CLICK");
  await page.mouse.click(420,340,{button:"left"});
  await expect(page.locator("#fishing-click-cue")).toContainText("RIGHT CLICK");
  const reelReadout=await page.evaluate(()=>{
    const green=document.querySelector<HTMLElement>("#fishing-reel-green")!;
    const fish=document.querySelector<HTMLElement>("#fishing-reel-fish")!;
    const progress=document.querySelector<HTMLElement>(
      "#fishing-reel-progress-fill")!;
    return {greenBottom:parseFloat(green.style.bottom),
      fishBottom:parseFloat(fish.style.bottom),
      progress:parseFloat(progress.style.height)};
  });
  expect(reelReadout.greenBottom).toBeGreaterThanOrEqual(0);
  expect(reelReadout.fishBottom).toBeGreaterThanOrEqual(0);
  expect(reelReadout.fishBottom).toBeLessThanOrEqual(100);
  expect(reelReadout.progress).toBeGreaterThanOrEqual(0);
  const rodAfter=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectFishingRod());
  expect(rodAfter).toMatchObject({
    rodVisible:true,lineVisible:true,bobberVisible:true,sameScene:true,
  });
  // A random escape now interrupts the ongoing reel session. The old
  // immediate-on-bite flick flow no longer exists.
  // Read the active target, hooked shadow, water motion and camera offset
  // in ONE browser frame. Reading them across separate await calls races
  // with the real 1750ms flick window and can see the next recovery phase.
  await expect.poll(async()=>page.evaluate(async()=>{
    const phase=document.querySelector("#fishing-hud")?.getAttribute("data-phase");
    if(phase!=="flick")return false;
    const {FISHING_FLICKS}=await import(
      "/Dungeon-Shop-Master/src/game/fishingSkill.ts");
    const targetSymbol=document.querySelector("#fishing-arrow")?.textContent;
    const target=FISHING_FLICKS.find(flick=>flick.glyph===targetSymbol);
    const fish=(await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectHookedFishingFish();
    const direction=document.querySelector("#fishing-fish-direction")?.textContent??"";
    if(!target||!fish.exists||!fish.visible||!fish.wakeVisible||
      !fish.sameScene||fish.lineTension===null||fish.lineTension<=.08||
      !direction.includes("FISH PULLS")||!direction.includes("COUNTER"))
      return false;
    const alignment=(fish.pull.x??0)*target.x+(fish.pull.y??0)*target.y;
    const displacementX=(fish.position.x??0)-(-8.5);
    const displacementZ=(fish.position.z??0)-(-27);
    const waterMove=displacementX*(fish.waterDirection.x??0)+
      displacementZ*(fish.waterDirection.z??0);
    const cameraShake=Math.hypot(fish.cameraTug.yaw??0,
      fish.cameraTug.pitch??0);
    return alignment<-.95&&waterMove>.02&&cameraShake>.0001;
  }),{timeout:11000,intervals:[90,120,160]}).toBe(true);
  // End without granting a fake catch. Esc must restore the real FPS camera.
  await page.keyboard.press("Escape");
  await expect(page.locator("#fishing-hud")).toBeHidden();
  const saved=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return await new CampaignStorage().loadGame();
  });
  expect(saved?.cellarFishCaught).toBe(0);
  expect(errors).toEqual([]);
});
