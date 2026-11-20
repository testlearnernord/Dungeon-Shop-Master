import {expect,test} from "@playwright/test";

test("LIVE dungeon abstracts the ongoing fight; opt-in arena uses same immutable 60Hz frames @ci-smoke",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Never let the initial startup autosave overwrite an explicit seeded
  // browser fixture written by a separate CampaignStorage instance.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  // Use the existing genuine saved world-clock fight fixture, not fabricated
  // poses or a second engine. An already discovered neighboring monster is
  // the only unknown adjacent location for this actual explorer.
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {generateExpeditionLayout,dungeonNeighbors}=
      await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {emptyLevel7World}=await import("/Dungeon-Shop-Master/src/game/level7Exploration.ts");
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
      earlyDungeonWorlds:[{floor:1 as const,world:{
        ...emptyLevel7World(),heroes:[{heroId:hero.id,...approach,visited}],
      }}],
    });
    store.enableLiveDungeon();
    store.advanceWorldTime(600);
    store.advanceWorldTime(10);
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
  const card=page.locator("#roster-detail-list [data-hero-id='"+heroId+"']");
  await expect(card).toBeVisible();
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  await expect(page.locator("#dungeon-mode-description")).toContainText("abstract dungeon map");
  await expect(page.locator("#dungeon-live-combat-summary")).toBeVisible();
  await expect(page.locator("#dungeon-live-combat-actors")).toContainText("HP");
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  const abstract=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveCombatPresentation());
  expect(abstract.battleMarkers).toBe(1);
  expect(abstract.liveMapMonsterMeshes).toBe(0);
  expect(abstract.liveMapProjectiles).toBe(0);
  expect(abstract.liveMapGhouls).toBe(0);
  await page.locator("#dungeon-watch-live-combat").click();
  await expect(page.locator("#dungeon-mode-description")).toContainText("3D combat arena");
  await expect(page.locator("#dungeon-return-from-combat")).toBeVisible();
  await expect(page.locator("#dungeon-watch-live-combat")).toBeHidden();
  const arena=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveCombatPresentation());
  expect(arena.sceneCount).toBe(abstract.sceneCount+1);
  expect(arena.isArena).toBe(true);
  expect(arena.arenaHeroes).toBeGreaterThanOrEqual(1);
  expect(arena.arenaMonsters).toBeGreaterThanOrEqual(1);
  expect(arena.spectatorCamera).toBe("crypt-spectator-camera");
  expect(arena.cryptSetpieces).toBeGreaterThan(24);
  expect(arena.activeArenaLights).toBeGreaterThanOrEqual(4);
  expect(arena.worldHudBarCount).toBe(arena.arenaHeroes+arena.arenaMonsters);
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
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  await expect(page.locator("#dungeon-mode-description")).toContainText("abstract dungeon map");
  await page.locator("#close-dungeon").click();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  expect(errors).toEqual([]);
});
