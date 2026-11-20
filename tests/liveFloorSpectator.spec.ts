import {expect,test} from "@playwright/test";

test("Floor selector watches multiple saved heroes/parties and separates the archive @ci-smoke",async({page})=>{
  test.setTimeout(100000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world=1");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const ids=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout,dungeonNeighbors}
      =await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const base=createGameState(7351);
    const [one,two,three,four]=base.adventurers;
    const layout=generateExpeditionLayout(7351,1);
    const layoutTwo=generateExpeditionLayout(7351,2);
    const beyond=dungeonNeighbors(layout,layout.entrance)[0];
    if(!beyond)throw Error("Seeded floor needs a connected second tile");
    const roster=base.adventurers.map(hero=>{
      if([one.id,two.id,three.id].includes(hero.id))
        return {...hero,status:"exploring" as const,floor:1 as const,
          traits:{...hero.traits,negative:"stubborn"}};
      if(hero.id===four.id)
        return {...hero,status:"exploring" as const,floor:2 as const};
      return {...hero,status:"at-shop" as const,floor:5 as const,
        shopStayDays:0};
    });
    const entry=(x:number,z:number,width:number)=>z*width+x;
    const first=layout.entrance;
    const state={
      ...base,adventurers:roster,
      dungeonParties:[{memberIds:[one.id,two.id],floor:1 as const,formedDay:1}],
      earlyDungeonWorlds:[
        {floor:1 as const,world:{
          resolvedFeatureIds:[],heroes:[
            {heroId:one.id,...first,visited:[entry(first.x,first.z,layout.width)]},
            {heroId:two.id,...first,visited:[entry(first.x,first.z,layout.width)]},
            {heroId:three.id,...beyond,visited:[
              entry(first.x,first.z,layout.width),entry(beyond.x,beyond.z,layout.width)]},
          ],
        }},
        {floor:2 as const,world:{
          resolvedFeatureIds:[],heroes:[{
            heroId:four.id,...layoutTwo.entrance,
            visited:[entry(layoutTwo.entrance.x,layoutTwo.entrance.z,layoutTwo.width)],
          }],
        }},
      ],
    };
    const store=new GameStore(state);
    store.enableLiveDungeon();
    await new CampaignStorage().saveGame(store.state);
    return [one.id,two.id,three.id,four.id];
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("1");
  await expect(page.locator("#dungeon-mode-description")).toContainText("whole-floor");
  await expect(page.locator("#dungeon-archive-controls")).toBeHidden();
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveDungeonFloor());
  const floorOne=await inspect();
  expect(new Set(floorOne.heroes.map(h=>h.id))).toEqual(new Set(ids.slice(0,3)));
  expect(floorOne.heroes.filter(h=>h.partyId)).toHaveLength(2);
  expect(floorOne.heroes.find(h=>h.id===ids[2])?.partyId).toBeNull();
  const first=floorOne.heroes.find(h=>h.id===ids[0])!;
  const third=floorOne.heroes.find(h=>h.id===ids[2])!;
  expect(Math.hypot(first.x-third.x,first.z-third.z)).toBeGreaterThan(1.5);
  expect(floorOne.combatMonsterMeshes).toBe(0);
  // Click an actual Babylon hero token in screen space. The entire
  // read-only panel must open without writing to GameStore or a fake route.
  const record=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing saved world");
    return {tick:state.worldClock.tick,adventurers:state.adventurers,
      dungeonParties:state.dungeonParties,liveDungeon:state.liveDungeon};
  });
  const beforeClick=await record();
  const clickPoint=await page.evaluate(async(heroId:string)=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .liveFloorHeroClickPoint(heroId),ids[2]);
  await page.locator("#renderCanvas").click({position:clickPoint});
  await expect(page.locator("#dungeon-hero-detail")).toBeVisible();
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Gold");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("No committed plan");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Solo");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Current activity");
  expect(await record()).toEqual(beforeClick);
  await page.locator("#dungeon-clear-hero").click();
  await expect(page.locator("#dungeon-hero-detail")).toBeHidden();
  await page.locator("#dungeon-floor-select").selectOption("2");
  await expect(page.locator("#dungeon-mode-description")).toContainText("Floor 2");
  const floorTwo=await inspect();
  expect(floorTwo.heroes.map(h=>h.id)).toEqual([ids[3]]);
  await page.locator("#dungeon-open-archive").click();
  await expect(page.locator("#dungeon-archive-controls")).toBeVisible();
  await expect(page.locator("#dungeon-replay-select option")).toHaveCount(1);
  await expect(page.locator("#dungeon-mode-description")).toContainText("development map");
  await page.locator("#dungeon-back-live").click();
  await expect(page.locator("#dungeon-archive-controls")).toBeHidden();
  expect((await inspect()).heroes.map(h=>h.id)).toEqual([ids[3]]);
  await page.locator("#dungeon-floor-select").selectOption("1");
  expect((await inspect()).heroes).toHaveLength(3);
  await page.locator("#close-dungeon").click();
  expect(errors).toEqual([]);
});
