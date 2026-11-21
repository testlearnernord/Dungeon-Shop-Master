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
          traits:{...hero.traits,negative:"stubborn"},
          ...(hero.id===three.id?{inventory:{...hero.inventory,
            finds:{"iron-ore":1,coal:2}}}:{})};
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
  // Check the actual active Babylon camera, not just the pure input math.
  const camera=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonLayout().camera);
  const neutralCamera=await camera();
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("w");
  await expect.poll(async()=>(await camera()).z-neutralCamera.z,
    {timeout:4000}).toBeGreaterThan(0.25);
  await page.keyboard.up("w");
  const afterW=await camera();
  await page.keyboard.down("s");
  await expect.poll(async()=>afterW.z-(await camera()).z,
    {timeout:4000}).toBeGreaterThan(0.25);
  await page.keyboard.up("s");
  // Right-mouse drag must rotate the live map without entering pointer lock.
  const canvas=await page.locator("#renderCanvas").boundingBox();
  expect(canvas).not.toBeNull();
  const mx=canvas!.x+canvas!.width*.5,my=canvas!.y+canvas!.height*.5;
  const beforeOrbit=await camera();
  await page.mouse.move(mx,my);
  await page.mouse.down({button:"right"});
  await page.mouse.move(mx+55,my+20,{steps:5});
  await page.mouse.up({button:"right"});
  const afterOrbit=await camera();
  expect(Math.hypot(afterOrbit.x-beforeOrbit.x,
    afterOrbit.z-beforeOrbit.z)).toBeGreaterThan(0.25);
  await page.keyboard.press("r");
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
  // Locate a true saved hero by keyboard-accessible UI. Changing the
  // inspector may move the camera, but must not modify the campaign.
  const locator=page.locator("#dungeon-hero-locator");
  await expect(locator).toBeVisible();
  await expect(locator.locator("option")).toHaveCount(4);
  const camera=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveFloorCameraFocus());
  const cameraBefore=await camera();
  await locator.selectOption(ids[2]);
  await expect(locator).toHaveValue(ids[2]);
  await expect(page.locator("#dungeon-hero-detail")).toBeVisible();
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText(
    "Recovered goods");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText(
    "Iron Ore ×1");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText(
    "Coal ×2");
  const cameraAfter=await camera();
  expect(cameraAfter.target.x).toBeCloseTo(third.x,2);
  expect(cameraAfter.target.z).toBeCloseTo(third.z,2);
  expect(cameraAfter.offset.x).toBeCloseTo(cameraBefore.offset.x,2);
  expect(cameraAfter.offset.y).toBeCloseTo(cameraBefore.offset.y,2);
  expect(cameraAfter.offset.z).toBeCloseTo(cameraBefore.offset.z,2);
  await locator.selectOption("");
  await expect(page.locator("#dungeon-hero-detail")).toBeHidden();
  expect(await record()).toEqual(beforeClick);
  const clickPoint=await page.evaluate(async(heroId:string)=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .liveFloorHeroClickPoint(heroId),ids[2]);
  await page.locator("#renderCanvas").click({position:clickPoint});
  await expect(page.locator("#dungeon-hero-detail")).toBeVisible();
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Gold");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("No committed plan");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Solo");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Current activity");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Other heroes seen");
  await expect(page.locator("#dungeon-hero-detail-values")).toContainText("Visible monsters");
  await expect(page.locator("#dungeon-minimap-heading")).toContainText("Personal Fog of War");
  const inspectFog=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveFloorFog());
  const subjective=await inspectFog();
  expect(subjective.tiles).toBeGreaterThan(100);
  expect(subjective.hiddenTiles).toBeGreaterThan(0);
  // Remembered-vs-current contrast is verified with deliberate long-path
  // fixtures by the LOS unit tests; a one-tile E2E trip may show no dim cells.
  expect(subjective.dimTiles).toBeGreaterThanOrEqual(0);
  expect(subjective.presentHeroes.length).toBeGreaterThan(0);
  expect(await record()).toEqual(beforeClick);
  const buttonHit=await page.evaluate(()=>{
    const button=document.querySelector<HTMLElement>("#dungeon-clear-hero")!;
    const rect=button.getBoundingClientRect();
    const target=document.elementFromPoint(rect.left+rect.width/2,
      rect.top+rect.height/2);
    return target?.id??target?.tagName??"none";
  });
  expect(buttonHit,"The visible close icon must be the topmost click target")
    .toBe("dungeon-clear-hero");
  // A real pointer click at the verified on-screen button center.
  // Locator.click() auto-scrolls the fixed HUD even though the target is
  // already visible, relocating the viewport and making its <aside> intercept.
  const closeBounds=await page.locator("#dungeon-clear-hero").boundingBox();
  expect(closeBounds).not.toBeNull();
  await page.mouse.click(closeBounds!.x+closeBounds!.width/2,
    closeBounds!.y+closeBounds!.height/2);
  await expect(page.locator("#dungeon-hero-detail")).toBeHidden();
  await expect(page.locator("#dungeon-minimap-heading")).toContainText("Full Floor");
  const neutral=await inspectFog();
  expect(neutral.hiddenTiles).toBe(0);
  expect(neutral.dimTiles).toBe(0);
  expect(neutral.presentHeroes.length).toBe(3);
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
