import {expect,test} from "@playwright/test";

test("historical map stays abstract; opting into archive arena loads the authored Ghoul @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  // Create a real, deterministic encounter at a genuine saved monster site.
  // The browser must use the ordinary day motor, not forged combat frames.
  await page.evaluate(async()=>{
    const {createGameState,advanceDay}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {generateExpeditionLayout,dungeonNeighbors}=await import(
      "/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const base=createGameState(7351);
    const map=generateExpeditionLayout(base.seed,1);
    const monster=map.features.find(f=>f.kind==="monster");
    if(!monster||monster.subtype!=="ghoul")throw Error("No authored Ghoul site");
    const approach=dungeonNeighbors(map,monster)[0];
    const visited=map.tiles.flatMap((tile,i)=>
      tile!=="wall"&&i!==monster.z*map.width+monster.x?[i]:[]);
    const hero={...base.adventurers[0],
      floor:1 as const,status:"exploring" as const,
      health:base.adventurers[0].stats.maxHealth,
      equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
      inventory:{...base.adventurers[0].inventory,healing:2},
    };
    const prepared={
      ...base,
      adventurers:base.adventurers.map((h,i)=>i===0?hero:{
        ...h,floor:5 as const,status:"at-shop" as const,shopStayDays:0,
      }),
      earlyDungeonWorlds:[{floor:1 as const,world:{
        resolvedFeatureIds:map.features.filter(f=>f.id!==monster.id).map(f=>f.id),
        heroes:[{heroId:hero.id,...approach,visited}],
      }}],
    };
    const after=advanceDay(prepared).state;
    const footage=after.events.filter(e=>e.type==="dungeon-exploration"&&
      e.dungeonReplay?.encounters.some(f=>f.featureId===monster.id));
    if(footage.length!==1)throw Error("Seeded Ghoul encounter not recorded");
    await new CampaignStorage().saveGame(after);
  });
  await page.reload();
  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-open-archive").click();
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonPlayback());
  expect((await inspect()).cryptRelics).toBeGreaterThan(0);
  // Regular expedition playback must never allocate any Ghoul GLBs.
  expect((await inspect()).ghoulActors).toHaveLength(0);
  expect((await inspect()).combatRenderMeshes).toBe(0);
  await page.locator("#dungeon-play").click(); // Pause the saved local tape.
  const fraction=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {buildDungeonPlayback}=await import(
      "/Dungeon-Shop-Master/src/game/dungeonReplayPlayback.ts");
    const state=await new CampaignStorage().loadGame();
    const record=state?.events.find(e=>e.dungeonReplay?.encounters.length)?.dungeonReplay;
    if(!record)throw Error("Recorded encounter absent after reload");
    const timeline=buildDungeonPlayback(record);
    const fight=timeline.segments.find(s=>s.kind==="combat");
    if(!fight)throw Error("No actual fight in the saved expedition");
    return 1000*Math.min(1,(fight.start+.2)/timeline.duration);
  });
  await page.locator("#dungeon-timeline").evaluate((node,value)=>{
    const slider=node as HTMLInputElement;
    slider.value=String(value);
    slider.dispatchEvent(new Event("input",{bubbles:true}));
  },fraction);
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  const abstract=await inspect();
  expect(abstract.abstractMarkers).toBe(1);
  expect(abstract.ghoulActors).toHaveLength(0);
  expect(abstract.combatRenderMeshes).toBe(0);
  // Opening the separate Babylon arena reads ONLY committed recorded frames.
  await page.locator("#dungeon-watch-live-combat").click();
  await expect(page.locator("#dungeon-mode-description")).toContainText("3D fight arena");
  const staged=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveCombatPresentation());
  expect(staged.cryptSetpieces).toBeGreaterThan(24);
  expect(staged.spectatorCamera).toBe("crypt-spectator-camera");
  expect(staged.worldHudBarCount).toBe(2);
  await expect.poll(async()=>{
    const state=await inspect();
    return state.ghoulActors[0]?.status??"missing";
  },{timeout:35000}).toBe("ready");
  await expect.poll(async()=>((await inspect()).ghoulActors[0]?.visible),
    {timeout:10000}).toBe(true);
  const during=await inspect();
  expect(during.ghoulActors[0]).toMatchObject({
    geometryCount:1,boneCount:65,status:"ready",
  });
  expect(during.ghoulActors[0].animationClip).toBeTruthy();
  await page.locator("#dungeon-return-from-combat").click();
  const back=await inspect();
  expect(back.abstractMarkers).toBe(1);
  expect(back.ghoulActors).toHaveLength(0);
  expect(back.hiddenTiles).toBeGreaterThan(0);
  await page.locator("#dungeon-replay-select").selectOption("preview");
  expect((await inspect()).ghoulActors).toHaveLength(0);
  await page.locator("#close-dungeon").click();
  expect(errors).toEqual([]);
});
