import {expect,test} from "@playwright/test";

test("a real Level-6 Troll battle is witnessed LIVE without replacing its saved 60Hz motor @ci-smoke",async({page})=>{
  test.setTimeout(115000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {DUNGEON_STEP_INTERVAL_TICKS}=await import("/Dungeon-Shop-Master/src/game/liveDungeonRuntime.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const first=initial.adventurers[0];
    const adventurers=initial.adventurers.map(hero=>hero.id===first.id
      ?{...hero,status:"expedition" as const,floor:6 as const,
        health:hero.stats.maxHealth,level6Permit:true}:hero);
    const store=new GameStore({...initial,adventurers});
    store.enableLiveDungeon();
    // Seed the first authoritative dungeon event and one real combat event.
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS+10);
    const battle=store.state.liveDungeon.bossCombat;
    if(!battle||battle.state.outcome!=="fighting"||
       battle.frames.length<2)
      throw new Error("No authoritative ongoing floor-6 boss fight");
    await new CampaignStorage().saveGame(store.state);
    return first.id;
  });
  await page.reload();
  await page.evaluate(()=>(window as Window&{
    __shopTestPauseWorld?:(paused:boolean)=>void
  }).__shopTestPauseWorld?.(true));
  const record=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing saved boss encounter");
    const boss=state.liveDungeon.bossCombat;
    if(!boss)throw Error("Saved boss encounter disappeared");
    return {tick:state.worldClock.tick,hp:boss.state.heroHp,
      bossHp:boss.state.bossHp,time:boss.state.time,
      frames:boss.frames.length,eventCount:state.events.length};
  });
  const before=await record();
  await page.locator("#open-roster").click();
  const card=page.locator('#roster-detail-list [data-hero-id="'+heroId+'"]');
  await expect(card).toBeVisible();
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-replay","live");
  await expect(page.locator("#arena-preview")).toContainText("LIVE BOSS");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  // Camera, animation and sound NEVER apply combat damage while the
  // saved world pacer is frozen for this observation-only assertion.
  expect(await record()).toEqual(before);
  await page.locator("#close-arena").click();
  await expect(page.locator("#arena-hud")).toBeHidden();
  expect(await record()).toEqual(before);
  expect(errors).toEqual([]);
});
