import {expect,test} from "@playwright/test";

/** Regression for the real FPS pickaxe action, topology rebuilding and save
 * persistence. No direct GameStore writes are used to excavate the test cell. */
test("unlock, mine exposed rock and keep the opening after reloading",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const initialWalls=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectMiningWallVisuals());
  expect(initialWalls.leftVisible).toBe(true);
  expect(initialWalls.rightVisible).toBe(true);
  await page.keyboard.press("u");
  const unlockedWalls=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectMiningWallVisuals());
  expect(unlockedWalls.leftVisible).toBe(true);
  expect(unlockedWalls.rightVisible).toBe(true);
  expect(unlockedWalls.leftMaterial).toBe(initialWalls.leftMaterial);
  expect(unlockedWalls.rightMaterial).toBe(initialWalls.rightMaterial);
  expect(unlockedWalls.transparentPickTargets).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.expansionTier;
  }),{timeout:10000}).toBe(1);
  const aimed=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtLevel5Rock(8,4));
  expect(aimed).toContain("excavation-rock-face-");
  // An unlocked cave MUST remain safe until the player explicitly arms mining.
  await page.keyboard.press("u");
  await expect(page.locator("#mining-mode-indicator")).toBeHidden();
  await page.mouse.click(400,300);
  const blocked=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.excavatedCells.includes("8,4");
  });
  expect(blocked).toBe(false);
  await page.keyboard.press("u");
  await expect(page.locator("#mining-mode-indicator")).toBeVisible();
  await page.mouse.click(400,300);
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.excavatedCells.includes("8,4");
  }),{timeout:10000}).toBe(true);
  const observe=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLevel5Rock(8,4));
  await expect.poll(async()=>(await observe()).floor).toBe(true);
  expect(await observe()).toEqual({floor:true,ceiling:true,clickableRock:false});
  const afterMining=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectMiningWallVisuals());
  expect(afterMining.leftVisible).toBe(true);
  expect(afterMining.rightVisible).toBe(false);
  expect(afterMining.uvSpan).not.toBeNull();
  expect(afterMining.uvSpan!).toBeLessThan(0.10,
    "one slice must inherit 1/14th of the original wall stone texture");
  // One additional mined cell must NOT replace an unchanged floor mesh.
  // The old room renderer disposed and rebuilt every cell after every strike.
  const stableFloor="excavated-floor-8,4";
  const oldMeshId=await page.evaluate(async name=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .level5MeshIdentity(name),stableFloor);
  expect(oldMeshId).not.toBeNull();
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtLevel5Rock(8,5));
  await page.mouse.click(400,300);
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.level5Room?.excavatedCells.includes("8,5");
  }),{timeout:10000}).toBe(true);
  const sameMeshId=await page.evaluate(async name=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .level5MeshIdentity(name),stableFloor);
  expect(sameMeshId).toBe(oldMeshId,
    "existing excavated floor geometry must survive adjacent mining");

  // The newly exposed flagstone must be pickable by the P blueprint
  // raycaster and share the shop's original floor material.
  const floorTarget=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectMinedFloorSurface("8,4"));
  expect(floorTarget).toEqual({pickable:true,sameMaterial:true,kind:"floor"});
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect.poll(async()=>(await observe()).floor).toBe(true);
  expect(await observe()).toEqual({floor:true,ceiling:true,clickableRock:false});
  expect(errors).toEqual([]);
});

test("contextual P moves and persists a shelf onto sufficiently excavated real floor",async({page})=>{
  test.setTimeout(120000);
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateLevel5Cell}=await import("/Dungeon-Shop-Master/src/game/level5Room.ts");
    const storage=new CampaignStorage();
    const state=await storage.loadGame();
    if(!state)throw new Error("Missing campaign");
    let room={...state.level5Room,expansionTier:3};
    // A continuous six-cell side tunnel permits a long, unobstructed
    // crosshair ray from Galvik's original showroom (>16m to the target).
    for(let x=8;x<=13;x++)for(let z=-3;z<=3;z++){
      const next=excavateLevel5Cell(room,{x,z});
      if(!next.ok)throw new Error(next.reason);
      room=next.room;
    }
    await storage.saveGame({...state,level5Room:room});
  });
  await page.reload();
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFurniture("shelf-2-back"));
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  const targeted=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBlueprintFloor(13,0));
  console.log("BLUEPRINT_DISTANT_RAY",targeted);
  expect(targeted).toContain("excavated-floor-13,0");
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),
    {timeout:10000}).toContain("X 13.00");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:10000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const placed=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout.shelves[1].x;
  });
  await expect.poll(placed).toBe(13);
  await page.reload();
  expect(await placed()).toBe(13);
});
