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
    return (await new CampaignStorage().loadGame())?.shopRoom?.expansionTier;
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
    return (await new CampaignStorage().loadGame())?.shopRoom?.excavatedCells.includes("8,4");
  });
  expect(blocked).toBe(false);
  await page.keyboard.press("u");
  await expect(page.locator("#mining-mode-indicator")).toBeVisible();
  await page.mouse.click(400,300);
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopRoom?.excavatedCells.includes("8,4");
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
    return (await new CampaignStorage().loadGame())?.shopRoom?.excavatedCells.includes("8,5");
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

test("N builds then P moves the first compact shelf onto excavated floor @ci-smoke",async({page})=>{
  test.setTimeout(120000);
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateShopRoomCell}=await import("/Dungeon-Shop-Master/src/game/shopRoomGeometry.ts");
    const storage=new CampaignStorage();
    const state=await storage.loadGame();
    if(!state)throw new Error("Missing campaign");
    let room={...state.shopRoom,expansionTier:3};
    // A continuous six-cell side tunnel permits a long, unobstructed
    // crosshair ray from Galvik's original showroom (>16m to the target).
    for(let x=8;x<=13;x++)for(let z=-3;z<=3;z++){
      const next=excavateShopRoomCell(room,{x,z});
      if(!next.ok)throw new Error(next.reason);
      room=next.room;
    }
    await storage.saveGame({...state,shopRoom:room});
  });
  await page.reload();
  // No original shelf exists. Construct an actual one through the player
  // blueprint, then move that same saved instance with contextual P.
  await page.locator("#build-shelf").click();
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBlueprintFloor(11,0));
  await page.keyboard.press("r");
  await page.keyboard.press("r");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:12000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout.shelves[0]?.x;
  })).toBe(11);
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtFurniture("shelf-1-back"));
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  const targeted=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBlueprintFloor(13,0));
  expect(targeted).toContain("excavated-floor-13,0");
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),
    {timeout:10000}).toContain("X 13.00");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:10000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const placed=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.shopLayout.shelves[0]?.x;
  });
  await expect.poll(placed).toBe(13);
  await page.reload();
  expect(await placed()).toBe(13);
});

test("contextual P mounts the board on freshly excavated stone and survives a reload",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateShopRoomCell}=await import("/Dungeon-Shop-Master/src/game/shopRoomGeometry.ts");
    const storage=new CampaignStorage(),state=await storage.loadGame();
    if(!state)throw new Error("Missing campaign");
    let room={...state.shopRoom,expansionTier:2};
    // A continuous 7m wall and connected 2m side wing; the rock at 10,0
    // is still solid and available as a real wall-mounted support.
    for(let x=8;x<=9;x++)for(let z=-3;z<=3;z++){
      const mined=excavateShopRoomCell(room,{x,z});
      if(!mined.ok)throw new Error(mined.reason);
      room=mined.room;
    }
    await storage.saveGame({...state,shopRoom:room});
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtRosterBoard());
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  const hit=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBoardWall(10,0));
  expect(hit).toContain("excavation-rock-face-9.5:");
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),
    {timeout:10000}).toContain("X 9.25");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:10000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const board=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.rosterBoard;
  });
  await expect.poll(board).toEqual({x:9.25,z:0,rotation:1});
  await page.reload();
  expect(await board()).toEqual({x:9.25,z:0,rotation:1});
  await expect.poll(async()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectMountedRosterBoardX()
  )).toBe(9.25);
  expect(errors).toEqual([]);
});

test("build the first four-slot shelf with N on mined floor and persist every real slot",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateShopRoomCell}=await import("/Dungeon-Shop-Master/src/game/shopRoomGeometry.ts");
    const storage=new CampaignStorage();
    const state=await storage.loadGame();
    if(!state)throw new Error("Missing campaign");
    let room={...state.shopRoom,expansionTier:3};
    for(let x=8;x<=13;x++)for(let z=-5;z<=5;z++){
      const cut=excavateShopRoomCell(room,{x,z});
      if(!cut.ok)throw new Error(cut.reason);
      room=cut.room;
    }
    await storage.saveGame({...state,shopRoom:room});
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#build-shelf").click();
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  expect(await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBlueprintFloor(11,0))).toContain("excavated-floor-11,0");
  await expect.poll(()=>page.locator("#blueprint-facing").textContent(),
    {timeout:10000}).toContain("X 11.00");
  // The smaller four-slot shelf now fits this excavation at either facing.
  // Rotation still changes the stored orientation and actual service sockets.
  await page.keyboard.press("r");
  await page.keyboard.press("r");
  await expect.poll(()=>page.locator("#blueprint-facing").textContent()).toContain("180°");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:15000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const read=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?{
      ids:state.shopLayout.shelves.map(shelf=>shelf.id),
      built:state.shopLayout.shelves[0],
      slots:state.shopEconomy.slots.filter(slot=>slot.shelfId==="shelf-1")
        .map(slot=>({id:slot.id,quantity:slot.quantity,itemId:slot.itemId})),
    }:null;
  });
  await expect.poll(async()=>(await read())?.ids.length).toBe(1);
  const persisted=await read();
  expect(persisted?.built).toEqual({id:"shelf-1",x:11,z:0,rotation:2});
  expect(persisted?.slots).toEqual(Array.from({length:4},(_,i)=>({
    id:`shelf-1-slot-${i+1}`,quantity:0,itemId:null,
  })));
  const scene=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectAdditionalShelf("shelf-1"));
  await expect.poll(async()=>(await scene()).slotCount).toBe(4);
  await page.reload();
  expect(await read()).toEqual(persisted);
  await expect.poll(async()=>(await scene()).slotCount).toBe(4);
  expect((await scene()).x).toBe(11);
  expect(errors).toEqual([]);
});

test("the portrait hangs using the FPS wall blueprint, moves onto mined stone and reloads textured",async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.locator("#build-portrait").click();
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  const face=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtPortraitWall(4.25));
  expect(face).toBe("front-right-wall");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:12000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const pose=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.wallPortrait;
  });
  await expect.poll(pose).toEqual({x:4.25,z:-6.45,rotation:2});
  await expect.poll(async()=>(
    await page.evaluate(async()=>(
      await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectWallPortrait())
    )).toMatchObject({enabled:true,x:4.25,textured:true});

  // Re-use the existing real excavation topology fixture, never a fake wall.
  await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {excavateShopRoomCell}=await import("/Dungeon-Shop-Master/src/game/shopRoomGeometry.ts");
    const storage=new CampaignStorage(),state=await storage.loadGame();
    if(!state)throw Error("Missing campaign");
    let room={...state.shopRoom,expansionTier:2};
    for(let x=8;x<=9;x++)for(let z=-3;z<=3;z++){
      const next=excavateShopRoomCell(room,{x,z});
      if(!next.ok)throw Error(next.reason);
      room=next.room;
    }
    await storage.saveGame({...state,shopRoom:room});
  });
  await page.reload();
  await expect.poll(pose).toEqual({x:4.25,z:-6.45,rotation:2});
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtWallPortrait());
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  const mined=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtExcavatedBoardWall(10,0));
  expect(mined).toContain("excavation-rock-face-9.5:");
  await expect.poll(()=>page.locator("#blueprint-panel .blueprint-status").textContent(),
    {timeout:12000}).toContain("Valid placement");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(pose).toEqual({x:9.25,z:0,rotation:1});
  await page.reload();
  await expect.poll(pose).toEqual({x:9.25,z:0,rotation:1});
  await expect.poll(async()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectWallPortrait()
  )).toMatchObject({enabled:true,x:9.25,z:0,textured:true});
  expect(errors).toEqual([]);
});
