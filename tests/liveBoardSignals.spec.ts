import {expect,test} from "@playwright/test";

test("a real lethal dungeon step raises ONE global world-feed warning and opens the fallen hero @ci-smoke",async({page})=>{
  test.setTimeout(95000);
  const errors:string[]=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout,dungeonNeighbors}=
      await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {emptyLevel7World}=
      await import("/Dungeon-Shop-Master/src/game/level7Exploration.ts");
    const initial=createGameState(7351);
    const layout=generateExpeditionLayout(7351,1);
    const trap=layout.features.find(f=>f.kind==="trap"&&
      dungeonNeighbors(layout,f).length>0);
    if(!trap)throw new Error("No real reachable trap in fixture.");
    const position=dungeonNeighbors(layout,trap)[0];
    const tile=trap.z*layout.width+trap.x;
    const visited=layout.tiles.flatMap((cell,i)=>
      cell==="wall"||i===tile?[]:[i]);
    const hero=initial.adventurers.find(h=>h.status==="exploring");
    if(!hero)throw new Error("Missing real explorer.");
    const game=new GameStore({...initial,
      adventurers:initial.adventurers.map(h=>
        h.id===hero.id?{...h,health:1,floor:1 as const,
          status:"exploring" as const}
        :h.status==="exploring"?{...h,floor:4 as const}:h),
      earlyDungeonWorlds:[{floor:1 as const,world:{
        ...emptyLevel7World(),heroes:[{heroId:hero.id,...position,visited}],
      }}],
    });
    game.enableLiveDungeon();
    game.advanceWorldTime(200);
    if(game.state.events.filter(e=>e.type==="hero-death-signal").length!==1)
      throw new Error("The actual trap must extinguish one signature.");
    await new CampaignStorage().saveGame(game.state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const alert=page.locator('#world-event-feed .world-feed-toast[data-category="death"]');
  await expect(page.locator("#live-death-signal")).toHaveCount(0);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("LIFE-SIGNATURE EXTINGUISHED");
  await expect(alert).not.toContainText(/trap|spikes|floor [0-9]|loot|killer/i);
  await expect(alert).toHaveAttribute("role","alert");
  await expect(page.locator("#world-event-feed .world-feed-toast")).toHaveCount(1);
  await alert.locator(".world-feed-jump").click();
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await expect(page.locator("#roster-filter")).toHaveValue("fallen");
  const fallen=page.locator("#roster-detail-list [data-hero-id='"+heroId+"']");
  await expect(fallen).toBeVisible();
  await expect(fallen).toContainText("Life-signature");
  await expect(fallen).not.toContainText(/F1 · Exploring|500 loot/i);
  await page.locator("#close-roster").click();
  await expect(alert).toHaveCount(0);
  await page.reload();
  await expect(alert).toBeVisible();
  await page.locator("#world-feed-toggle").click();
  await expect(page.locator("#world-feed-settings")).toBeVisible();
  await page.locator("#world-feed-level").selectOption("minimal");
  await page.locator("#world-feed-duration").selectOption("5");
  expect(errors).toEqual([]);
});
