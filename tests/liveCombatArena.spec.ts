import {expect,test} from "@playwright/test";

test("LIVE dungeon abstracts the ongoing fight; opt-in arena uses same immutable 60Hz frames @ci-smoke",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  // Pause the real world BEFORE boot/reload: setting pause after the page
  // becomes interactive races autonomous 60Hz combat and can finish the fight.
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Never let the initial startup autosave overwrite an explicit seeded
  // browser fixture written by a separate CampaignStorage instance.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  // Vite may replace its boot document the first time this browser-only
  // scene inspector is transformed. Warm it before seeding the committed fight,
  // so a late module compile cannot navigate away mid-assertion.
  await expect.poll(async()=>{
    try {
      return await page.evaluate(async()=>{
        await import("/Dungeon-Shop-Master/tests/scene.ts");
        return true;
      });
    } catch(error) {
      // Retry only actual Vite startup/navigation races; other import errors
      // still fail the test instead of hiding a broken production module.
      if(/Execution context was destroyed|Failed to fetch dynamically imported module/.test(
        String(error)))return false;
      throw error;
    }
  },{timeout:30000,intervals:[200,400,800]}).toBe(true);
  // Vite's initial inspector compile may reload the page, which correctly
  // changes the UI copy from "Saved" to "Continued saved".
  await expect(page.locator("#save-status")).toHaveText(
    /^(?:Saved|Continued saved) Day 1\.$/);
  // Use the existing genuine saved world-clock fight fixture, not fabricated
  // poses or a second engine. An already discovered neighboring monster is
  // the only unknown adjacent location for this actual explorer.
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {DUNGEON_STEP_INTERVAL_TICKS}=await import("/Dungeon-Shop-Master/src/game/liveDungeonRuntime.ts");
    const {generateExpeditionLayout,dungeonNeighbors}=
      await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {emptySpatialDungeonWorld}=await import("/Dungeon-Shop-Master/src/game/spatialDungeonExploration.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const map=generateExpeditionLayout(7351,1);
    const monster=map.features.find(f=>f.kind==="monster"&&
      dungeonNeighbors(map,f).length>0);
    if(!monster)throw Error("Missing seeded dungeon monster");
    const approach=dungeonNeighbors(map,monster)[0];
    const monsterIndex=monster.z*map.width+monster.x;
    const visited=map.tiles.flatMap((tile,index)=>
      tile!=="wall"&&index!==monsterIndex?[index]:[]);
    const hero=initial.adventurers.find(h=>h.status==="exploring"&&h.floor===1);
    if(!hero)throw Error("Missing real explorer");
    const store=new GameStore({...initial,
      dungeonWorlds:[{floor:1 as const,world:{
        ...emptySpatialDungeonWorld(),heroes:[{heroId:hero.id,...approach,visited}],
      }}],
    });
    store.enableLiveDungeon();
    // One spatial step reaches the known monster; the 10-tick event records
    // an authentic combat frame without accidentally finishing the duel.
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS+10);
    if(!store.state.liveDungeon.combats.some(f=>f.heroIds.includes(hero.id)))
      throw Error("Expected authentic running fight");
    await new CampaignStorage().saveGame(store.state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Keep the fight state stable during UI A/B; normal world motion is checked
  // separately below and remains controlled by the one WorldClockPacer.
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void
  }).__shopTestPauseWorld?.(true));
  const record=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing saved genuine fight");
    return {tick:state.worldClock.tick,
      combats:state.liveDungeon.combats,events:state.events,
      gold:state.shopEconomy.gold};
  });
  const before=await record();
  await page.locator("#open-roster").click();
  const card=page.locator("#roster-detail-list details.roster-card[data-hero-id='"+heroId+"']");
  await expect(card).toBeVisible();
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  await expect(page.locator("#dungeon-mode-description")).toContainText("whole-floor dungeon overview",{timeout:20000});
  await expect(page.locator("#dungeon-live-combat-summary")).toBeVisible();
  await expect(page.locator("#dungeon-live-combat-actors")).toContainText("HP");
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  const abstract=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveCombatPresentation());
  expect(abstract.battleMarkers).toBe(1);
  expect(abstract.liveMapMonsterMeshes).toBe(0);
  expect(abstract.liveMapProjectiles).toBe(0);
  expect(abstract.liveMapGhouls).toBe(0);
  // Navigate to the actual in-progress encounter; its coordinates and
  // combat ID are taken from the saved authoritative world, not a fake map.
  const expectedFight=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout}=await import(
      "/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing real LIVE dungeon fight");
    const fight=state.liveDungeon.combats[0];
    if(!fight)throw Error("The genuine fight is missing");
    const layout=generateExpeditionLayout(state.seed,fight.encounter.floor);
    return {id:fight.id,
      x:(fight.encounter.x-(layout.width-1)/2)*2.5,
      z:(fight.encounter.z-(layout.height-1)/2)*2.5};
  });
  const locator=page.locator("#dungeon-fight-locator");
  await expect(locator).toBeVisible();
  await expect(locator.locator("option")).toHaveCount(2);
  await locator.selectOption(expectedFight.id);
  await expect(locator).toHaveValue(expectedFight.id);
  const mapFocus=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveFloorCameraFocus());
  expect(mapFocus.target.x).toBeCloseTo(expectedFight.x,2);
  expect(mapFocus.target.z).toBeCloseTo(expectedFight.z,2);
  await expect(page.locator("#dungeon-hero-detail")).toBeHidden();
  expect(await record()).toEqual(before,
    "Locating a LIVE encounter must never rerun or modify the combat motor");
  await page.locator("#dungeon-watch-live-combat").click();
  // A premium camera intro exists only after opt-in. It is a read-only
  // presentation and must never pause/advance the authoritative fight.
  await expect(page.locator("#dungeon-fight-cinematic")).toBeVisible();
  await expect(page.locator("#dungeon-fight-intro-caption")).not.toBeEmpty();
  await expect(page.locator("#dungeon-skip-intro")).toBeVisible();
  expect(await record()).toEqual(before);
  await page.keyboard.press("Space");
  await expect(page.locator("#dungeon-fight-cinematic")).toBeHidden();
  expect(await record()).toEqual(before,
    "Skipping a camera cut cannot change world time, HP or loot");
  await expect(page.locator("#dungeon-mode-description")).toContainText("3D combat arena");
  await expect(page.locator("#music-track")).toHaveText("No Safe Passage");
  await expect(page.locator("#dungeon-return-from-combat")).toBeVisible();
  await expect(page.locator("#dungeon-watch-live-combat")).toBeHidden();
  const arena=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveCombatPresentation());
  expect(arena.sceneCount).toBe(abstract.sceneCount+1);
  expect(arena.isArena).toBe(true);
  expect(arena.arenaHeroes).toBeGreaterThanOrEqual(1);
  expect(arena.arenaMonsters).toBeGreaterThanOrEqual(1);
  expect(arena.legacyMonsterPlaceholders).toBe(0);
  expect(arena.spectatorCamera).toBe("crypt-spectator-camera");
  expect(arena.cryptSetpieces).toBeGreaterThan(24);
  expect(arena.activeArenaLights).toBeGreaterThanOrEqual(4);
  expect(arena.worldHudBarCount).toBe(arena.arenaHeroes+arena.arenaMonsters);
  // One tactical Party Card per saved hero, but zero duplicated 3D HP plates.
  const partyCards=page.locator(
    "#dungeon-hero-party-roster .hero-card--combat");
  await expect(partyCards).toHaveCount(arena.arenaHeroes);
  await expect(page.locator("#dungeon-hero-party-roster"))
    .toContainText("PARTY");
  await expect(partyCards.first().locator(".hero-card-portrait"))
    .toHaveAttribute("data-portrait-id",/\d+/);
  await expect(partyCards.first().locator(".hero-card-combat-phase"))
    .toBeVisible();
  await expect(partyCards.first()).toHaveAttribute("role","button");
  await expect(page.locator("#dungeon-hero-party-roster .hero-combat-roster-item"))
    .toHaveCount(arena.arenaHeroes);
  await expect(partyCards.first().locator(".hero-card-combat-phase"))
    .toHaveAttribute("data-phase",/move|windup|strike|recover|heal|parry|roll|hurt|dead|cast/);
  await page.locator("#dungeon-hero-party-roster .hero-card-inspect")
    .first().click();
  await expect(page.locator("#world-hero-card .hero-card--expanded"))
    .toBeVisible();
  await expect(page.locator("#world-hero-card")).toContainText(
    "CARRIED GOODS");
  await page.locator("#world-hero-card-close").click();

  // The fixture pauses the one authoritative world clock. An asynchronously
  // loaded Ghoul must still become visible from the last committed frame
  // without a fake NPC, extra combat step or a world-time change.
  const ghoul=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectDungeonPlayback().ghoulActors[0]);
  await expect.poll(async()=>((await ghoul())?.status??"missing"),
    {timeout:35000}).toBe("ready");
  await expect.poll(async()=>((await ghoul())?.visible??false),
    {timeout:15000}).toBe(true);

  expect(await record()).toEqual(before,
    "Watching LIVE must never decide a result or mutate saved HP/loot/frames");
  // With the real world resumed, both view modes remain spectators and
  // independent shop/dungeon clocks continue during Arena rendering.
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void
  }).__shopTestPauseWorld?.(false));
  const traffic=()=>page.evaluate(()=>(window as Window&{
    __shopTestTraffic?:()=>{tick:number}
  }).__shopTestTraffic?.().tick??-1);
  const tick=await traffic();
  await expect.poll(traffic,{timeout:12000}).toBeGreaterThan(tick+10);
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void
  }).__shopTestPauseWorld?.(true));
  await page.keyboard.press("Escape");
  await expect(page.locator("#music-track")).toHaveText("Beneath the Surface");
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  await expect(page.locator("#dungeon-mode-description")).toContainText("whole-floor dungeon overview",{timeout:20000});
  // While the world is paused, advance one GENUINE 10-tick combat event.
  // Only the committed 60Hz fighter frames/HP change: the floor map,
  // lighting, fog and minimap must not be repainted for that nonspatial step.
  const mapWrites=await page.evaluate(()=>{
    const canvas=document.querySelector<HTMLCanvasElement>("#dungeon-minimap")!;
    const ctx=canvas.getContext("2d")!;
    const original=ctx.fillRect;
    let writes=0;
    ctx.fillRect=(x,y,width,height)=>{
      writes++;
      original.call(ctx,x,y,width,height);
    };
    const hooks=window as Window&{
      __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
      __dungeonMapCanvasWrites?:()=>number;
    };
    hooks.__dungeonMapCanvasWrites=()=>writes;
    return writes;
  });
  expect(mapWrites).toBe(0);
  await page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
    };
    if(!hooks.__shopTestAdvanceWorldTicks)
      throw Error("Missing real world-clock E2E advance");
    hooks.__shopTestAdvanceWorldTicks(10);
  });
  await page.waitForTimeout(250);
  const unnecessaryMapWrites=await page.evaluate(()=>(
    window as Window&{__dungeonMapCanvasWrites?:()=>number}
  ).__dungeonMapCanvasWrites?.()??-1);
  expect(unnecessaryMapWrites).toBe(0);
  await expect(page.locator("#dungeon-live-combat-summary")).toBeVisible();
  await page.locator("#close-dungeon").click();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  expect(errors).toEqual([]);
});
