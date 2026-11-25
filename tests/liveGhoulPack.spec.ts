import {expect,test} from "@playwright/test";

test("one real LIVE Ghoul pack is abstract on the floor and individually rendered only in an opted-in arena @ci-smoke",async({page})=>{
  test.setTimeout(115000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  // The browser test compares identical saved checkpoints. Freeze the
  // real world pacer before the first render on BOTH boot and reload;
  // otherwise legitimate LIVE combat advances during heavy GLB loading.
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const prepared=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {DUNGEON_STEP_INTERVAL_TICKS}=await import("/Dungeon-Shop-Master/src/game/liveDungeonRuntime.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout,dungeonNeighbors}=
      await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {prepareSpatialDungeonCombat,emptySpatialDungeonWorld}=
      await import("/Dungeon-Shop-Master/src/game/spatialDungeonExploration.ts");
    let chosen:null|{seed:number;siteId:string;approach:{x:number;z:number};
      visited:number[];pack:number}=null;
    for(let seed=7351;seed<7380&&!chosen;seed++){
      const initial=createGameState(seed),layout=generateExpeditionLayout(seed,3);
      const hero=initial.adventurers.find(a=>a.status==="exploring");
      if(!hero)throw Error("No real active explorer");
      for(const site of layout.features.filter(feature=>feature.kind==="monster")){
        const approach=dungeonNeighbors(layout,site)[0];
        if(!approach)continue;
        const visitor={...hero,status:"exploring" as const,floor:3 as const};
        const result=prepareSpatialDungeonCombat([visitor],site,layout.seed,
          layout,approach,0,true);
        const pack=result.options.actors.filter(a=>a.team==="monsters").length;
        if(pack<2)continue;
        const visited=layout.tiles.flatMap((tile,i)=>
          tile!=="wall"&&i!==site.z*layout.width+site.x?[i]:[]);
        chosen={seed,siteId:site.id,approach,visited,pack};break;
      }
    }
    if(!chosen)throw Error("No seeded physical Ghoul pack found");
    const initial=createGameState(chosen.seed);
    const hero=initial.adventurers.find(a=>a.status==="exploring")!;
    const moved={...hero,status:"exploring" as const,floor:3 as const};
    const store=new GameStore({...initial,
      adventurers:initial.adventurers.map(a=>a.id===moved.id?moved:a),
      dungeonWorlds:[{floor:3 as const,world:{
        ...emptySpatialDungeonWorld(),heroes:[{
          heroId:moved.id,...chosen.approach,visited:chosen.visited,
        }],
      }}],
    });
    store.enableLiveDungeon();
    // At multiple movement events the encounter may have completed.
    // Assert the actual first committed fight instead of chasing an old clock.
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS+10);
    const live=store.state.liveDungeon.combats.find(c=>
      c.heroIds.includes(moved.id));
    if(!live)throw Error("Seeded pack did not start a real LIVE fight");
    const actualPack=live.state.actors.filter(a=>a.team==="monsters");
    if(actualPack.length!==chosen.pack)throw Error("Prepared pack changed");
    await new CampaignStorage().saveGame(store.state);
    return {heroId:moved.id,pack:chosen.pack};
  });
  await page.reload();
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void
  }).__shopTestPauseWorld?.(true));
  const record=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("No saved pack combat");
    return {tick:state.worldClock.tick,combats:state.liveDungeon.combats,
      events:state.events};
  });
  const before=await record();
  await page.locator("#open-roster").click();
  const card=page.locator('#roster-detail-list details.roster-card[data-hero-id="'+prepared.heroId+'"]');
  await expect(card).toBeVisible();
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  const probe=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveCombatPresentation());
  await expect(page.locator("#dungeon-watch-live-combat")).toBeVisible();
  const abstract=await probe();
  expect(abstract.battleMarkers).toBe(1);
  expect(abstract.liveMapGhouls).toBe(0);
  expect(abstract.liveMapProjectiles).toBe(0);
  await page.locator("#dungeon-watch-live-combat").click();
  await expect(page.locator("#dungeon-fight-cinematic")).toBeVisible();
  await expect(page.locator("#music-track")).toHaveText("No Safe Passage");
  const arena=await probe();
  expect(arena.isArena).toBe(true);
  expect(arena.arenaMonsters).toBe(prepared.pack);
  expect(arena.arenaHeroes).toBe(1);
  expect(arena.worldHudBarCount).toBe(prepared.pack+1);
  expect(arena.legacyMonsterPlaceholders).toBe(0);
  expect(await record()).toEqual(before,
    "Watching real multi-Ghoul fighters must never re-run their combat AI");
  await page.locator("#dungeon-return-from-combat").click();
  await expect(page.locator("#music-track")).toHaveText("Beneath the Surface");
  const restored=await probe();
  expect(restored.battleMarkers).toBe(1);
  expect(restored.liveMapGhouls).toBe(0);
  expect(await record()).toEqual(before);
  await page.locator("#close-dungeon").click();
  expect(errors).toEqual([]);
});
