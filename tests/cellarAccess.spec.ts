import {expect,test} from "@playwright/test";

/** Actual Babylon FPS integration: the secret portrait is picked by E,
 * the blocker changes collision, and Galvik walks down the same scene's ramp.
 * No game-store mutation or fake cellar teleport is used. */
test("portrait reveals a physical staircase to the mineable cellar @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // The DOM Day 1 label appears before the game engine and scene are
  // necessarily booted. Probe Babylon readiness, then do the real FPS aim.
  await expect.poll(async()=>{
    try{
      return await page.evaluate(async()=>(
        await import("/Dungeon-Shop-Master/tests/scene.ts")).shopSceneReady());
    }catch(error){
      // Vite may reload/transpile this E2E-only helper while predev assets
      // are rebuilding. Retry only during the bounded bootstrap poll; a
      // permanently broken module still fails after the 30-second deadline.
      if(!/Execution context was destroyed|Failed to fetch dynamically imported module/.test(String(error)))
        throw error;
      return false;
    }
  },{timeout:30000,intervals:[200,400,700]}).toBe(true);
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtCellarPortrait());
  await page.keyboard.press("e");
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.cellarDoorOpen;
  }),{timeout:12000}).toBe(true);
  const gate=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCellarGate());
  expect(gate).toEqual({blocked:false,ramp:true,cellarFloor:true,chest:true});
  // Start at the actual upper stair landing and WALK downhill. The real FPS
  // camera must follow the slope, not be teleported to a second world.
  await page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    helper.aimAtCellarStairs();
    helper.trackCellarCollisions();
  });
  await page.locator("#renderCanvas").focus();
  const position=async()=>{
    return await page.evaluate(async()=>(
      await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer());
  };
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:12000,
      intervals:[250,300,350,400]}).toBeLessThan(-20.2);
  } finally {
    await page.keyboard.up("w");
  }
  const after=await page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return {player:helper.inspectPlayer(),hits:helper.inspectCellarCollisions()};
  });
  console.log("Cellar descent diagnostic",JSON.stringify(after));
  expect(after.player.y).toBeLessThan(-2.3);
  // Re-aim UP the same physical staircase and walk out past the secret door.
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimUpCellarStairs());
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:12000,
      intervals:[250,300,350,400]}).toBeGreaterThan(-12.0);
  } finally {
    await page.keyboard.up("w");
  }
  const returned=await position();
  console.log("Cellar return diagnostic",JSON.stringify(returned));
  expect(returned.y).toBeGreaterThan(.75);
  // Normal players approach slightly off-centre. They must not need pixel-
  // perfect alignment at the original 1.2m doorway.
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtCellarStairs(-.48));
  await page.keyboard.down("w");
  try {
    await expect.poll(async()=>(await position()).z,{timeout:9000,
      intervals:[250,300,350]}).toBeLessThan(-14.0);
  } finally {
    await page.keyboard.up("w");
  }
  expect(errors).toEqual([]);
});


test("Galvik's Table shows a live physical 3D dungeon with selected floor @ci-smoke",async({page},testInfo)=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world=1");
  await expect(page.locator("#day")).toHaveText("Day 1");

  // Page HMR may replace the whole initial document while Vite processes
  // assets. Move Galvik only after the same real Babylon shop is initialized.
  const inspect=()=>page.evaluate(async()=>{
    const helper=await import("/Dungeon-Shop-Master/tests/scene.ts");
    if(!helper.shopSceneReady())return null;
    helper.aimAtGalviksTable();
    return helper.inspectGalviksLiveTable();
  });
  await expect.poll(async()=>{
    try{return await inspect();}
    catch(error){
      if(String(error).includes("Execution context was destroyed"))return null;
      throw error;
    }
  },{timeout:30000,intervals:[300,700,1000]}).toMatchObject({
    dioramaExists:true,dioramaEnabled:true,
    physicallyParented:true,observedFloor:1,
    layoutWidth:19,layoutHeight:19,
    baseExists:true,floorLabelExists:true,
    flatLegacyInset:false,shopMode:true,inShopScene:true,
  });
  const first=await inspect();
  expect(first).not.toBeNull();
  expect(first!.wallInstances).toBeGreaterThan(50);
  expect(first!.wallHeight).toBeGreaterThan(.025);
  // Real authored figures and crypt props must remain legible above the
  // masonry when Galvik stands at the table, without a second camera.
  expect(first!.artHeightScale).toBeGreaterThan(.03);
  expect(first!.featureCount).toBeGreaterThan(5);
  expect(first!.sceneMeshCount).toBeGreaterThan(5);
  // Existing LIVE art assets, not colored geometry-only placeholders.
  expect(first!.wallMaterial).toContain("live-stone");
  expect(first!.floorMaterial).toContain("live-flagstones");
  expect(first!.authoredProps).toBeGreaterThan(3);
  expect(first!.cryptCount).toBeGreaterThan(1);
  expect(first!.stairCount).toBeGreaterThan(0);
  if(first!.actorCount>0)
    expect(first!.heroModelCount).toBeGreaterThanOrEqual(first!.actorCount);
  await expect.poll(async()=>(await inspect())?.authoredGhouls,{
    timeout:25000,intervals:[300,600,900],
  }).toBeGreaterThan(0);

  // Pixel inspection happens on the FINAL physical shop screenshot,
  // not an offscreen texture which might be black/white once sampled.
  const points=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).galviksDioramaScreenshotPoints());
  const wallPoints=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).galviksDioramaWallPixels());
  expect(wallPoints.length).toBeGreaterThan(15);
  const screenshot=await page.screenshot();
  await testInfo.attach("galviks-real-3d-table",{
    body:screenshot,contentType:"image/png",
  });
  const colors=await page.evaluate(async({base64,points})=>{
    const image=new Image();
    image.src="data:image/png;base64,"+base64;
    await image.decode();
    const canvas=document.createElement("canvas");
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("Screenshot decoder unavailable");
    context.drawImage(image,0,0);
    return points.map(p=>{
      if(p.x<0||p.y<0||p.x>=canvas.width||p.y>=canvas.height)
        throw Error("Miniature outside shop canvas");
      const data=context.getImageData(p.x,p.y,1,1).data;
      return [data[0]!,data[1]!,data[2]!] as const;
    });
  },{base64:screenshot.toString("base64"),points:[...points,...wallPoints]});
  const wallColors=colors.slice(points.length);
  const wallLuminance=wallColors.map(rgb=>Math.max(...rgb));
  console.log("GALVIK_WALL_PIXEL_DIAGNOSTIC",JSON.stringify({
    count:wallLuminance.length,
    lit:wallLuminance.filter(v=>v>32).length,
    min:Math.min(...wallLuminance),
    max:Math.max(...wallLuminance),
  }));
  expect(wallLuminance.filter(value=>value>32).length)
    .toBeGreaterThan(Math.floor(wallLuminance.length*.3));
  const luminances=colors.slice(0,points.length).map(rgb=>Math.max(...rgb));
  // The centered white FPS crosshair may cover one or two sampled points.
  // A solid-white surface still fails, without false positives from the HUD.
  expect(luminances.filter(v=>v>240).length).toBeLessThanOrEqual(2);
  expect(Math.max(...luminances)-Math.min(...luminances))
    .toBeGreaterThan(20);

  // The selector in the FULL LIVE viewer is the only floor selection.
  // Selecting a deeper level must rebuild the miniature and its floor label.
  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-floor-select").selectOption("6");
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("6");
  await page.locator("#close-dungeon").click();
  await expect.poll(async()=>(await inspect())?.observedFloor,{timeout:30000})
    .toBe(6);
  const second=await inspect();
  expect(second).toMatchObject({
    layoutWidth:31,layoutHeight:31,
    physicallyParented:true,shopMode:true,
    dioramaEnabled:true,flatLegacyInset:false,
    shopCamera:first!.shopCamera,
  });
  expect(second!.wallInstances).toBeGreaterThan(first!.wallInstances);
  // The deeper 31×31 floor gets a separate real-shop screenshot. It must be
  // inspected at the same FPS distance, not inferred from Floor 01 pixels.
  await testInfo.attach("galviks-floor-06-table",{
    body:await page.screenshot(),contentType:"image/png",
  });
  expect(errors).toEqual([]);
});
