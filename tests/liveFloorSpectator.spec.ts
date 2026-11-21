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
  // The explicit Adventurer Board uses actual saved hero levels, HP,
  // equipment, gold and floor. Passive magical signals remain separate.
  await page.locator("#open-roster").click();
  const liveCard=page.locator('#roster-detail-list [data-hero-id="'+ids[2]+'"]');
  await expect(liveCard.locator("summary")).toContainText("Lv 1");
  await expect(liveCard.locator("summary")).toContainText("Floor 1");
  await expect(liveCard.locator("summary .hero-card-vital-track")).toHaveAttribute("aria-valuenow",/\d+/);
  await liveCard.locator("summary").click();
  await expect(liveCard.locator(".roster-card-extended .hero-card")).toHaveAttribute("data-source","live");
  await expect(liveCard.locator(".roster-card-extended")).toContainText("CARRIED GOODS");
  await expect(liveCard.locator(".roster-card-extended .hero-card-item[aria-label='Iron Ore ×1']")).toHaveCount(1);
  await page.locator("#close-roster").click();
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("1");
  const floorOverview=page.locator("#dungeon-map-status");
  const partyCard=page.locator("#dungeon-temporary-party");
  await expect(floorOverview).toBeVisible();
  await expect(partyCard).toBeVisible();
  const positions=await page.evaluate(()=>{
    const first=document.querySelector("#dungeon-map-status")!.getBoundingClientRect();
    const second=document.querySelector("#dungeon-temporary-party")!.getBoundingClientRect();
    const rail=document.querySelector("#dungeon-left-rail")!.getBoundingClientRect();
    return {overview:{top:first.top,bottom:first.bottom},
      party:{top:second.top,bottom:second.bottom},
      rail:{top:rail.top,bottom:rail.bottom}};
  });
  expect(positions.party.top).toBeGreaterThanOrEqual(positions.overview.bottom+3);
  // A compact rail may scroll when both overview and party cards are tall.
  // Do not require all cards to fit inside the viewport simultaneously.
  const railFlow=await page.evaluate(()=>{
    const rail=document.querySelector<HTMLElement>("#dungeon-left-rail")!;
    return {overflowY:getComputedStyle(rail).overflowY,
      clientHeight:rail.clientHeight,scrollHeight:rail.scrollHeight};
  });
  expect(railFlow.overflowY).toBe("auto");
  expect(railFlow.scrollHeight).toBeGreaterThanOrEqual(railFlow.clientHeight);
  expect(positions.rail.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  // The toolbar gains a second/third row when LIVE hero selectors appear.
  // The OVERVIEW must never cover the locator (desktop or narrow layouts).
  await expect(page.locator("#dungeon-hero-locator-label")).toBeVisible();
  const hudClearance=()=>page.evaluate(()=>{
    const rect=(selector:string)=>document.querySelector<HTMLElement>(selector)!
      .getBoundingClientRect();
    const header=rect("#dungeon-hud .dungeon-toolbar");
    const rail=rect("#dungeon-left-rail");
    const locator=rect("#dungeon-hero-locator-label");
    const map=rect("#dungeon-hud .dungeon-minimap-panel");
    return Math.min(rail.top-header.bottom,rail.top-locator.bottom,
      map.top-header.bottom);
  });
  await expect.poll(hudClearance,{timeout:5000}).toBeGreaterThanOrEqual(8);
  // A native select popup may extend below the header rectangle; the
  // interactive header must still stack above the read-only overview.
  const dropdownAboveOverview=await page.evaluate(()=>{
    const toolbar=document.querySelector<HTMLElement>(
      "#dungeon-hud .dungeon-toolbar")!;
    const rail=document.querySelector<HTMLElement>("#dungeon-left-rail")!;
    return Number(getComputedStyle(toolbar).zIndex)>
      Number(getComputedStyle(rail).zIndex);
  });
  expect(dropdownAboveOverview).toBe(true);
  const originalViewport=page.viewportSize()!;
  await page.setViewportSize({width:760,height:720});
  await expect.poll(hudClearance,{timeout:5000}).toBeGreaterThanOrEqual(8);
  await page.setViewportSize(originalViewport);
  await expect.poll(hudClearance,{timeout:5000}).toBeGreaterThanOrEqual(8);
  await expect(page.locator("#dungeon-mode-description")).toContainText("whole-floor");
  await expect(page.locator("#dungeon-archive-controls")).toBeHidden();
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectLiveDungeonFloor());
  const floorOne=await inspect();
  // The actual seeded dungeon has recognisable three-dimensional treasure
  // chests, pressure-plate spikes and true shared Tripo Ghoul instances.
  // No animated battle actors are allocated in the overview.
  const featureArt=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectDungeonFeatureProps());
  await expect.poll(async()=>(await featureArt()).ghoulModels,
    {timeout:15000}).toBeGreaterThan(0);
  const stairArt=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonStairMarkers());
  expect(stairArt).toHaveLength(2);
  expect(stairArt.map(stair=>stair.kind)).toEqual(["descend","exit"]);
  expect(stairArt.map(stair=>stair.steps)).toEqual([4,4]);
  expect(stairArt.find(stair=>stair.kind==="descend")?.destination).toBe(2);
  expect(stairArt.find(stair=>stair.kind==="exit")?.destination).toBeNull();
  const visuals=await featureArt();
  expect(visuals.chests).toBeGreaterThan(0);
  expect(visuals.lids).toBe(visuals.chests);
  expect(visuals.chestBands).toBe(visuals.chests*2);
  expect(visuals.traps).toBeGreaterThan(0);
  expect(visuals.spikes).toBe(visuals.traps*5);
  expect(visuals.ghoulModels).toBe(visuals.ghoulMarkers);
  expect(visuals.fallbackIcons).toBe(0);
  expect(visuals.errors).toEqual([]);
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
  await expect(page.locator("#dungeon-compass-reset")).toBeVisible();
  await expect(page.locator("#dungeon-compass-needle")).not.toHaveCSS("transform","none");
  const northFocus=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveFloorCameraFocus());
  const beforeNorth=await northFocus();
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("w");
  await expect.poll(async()=>{
    const moved=await northFocus();
    return Math.hypot(moved.target.x-beforeNorth.target.x,
      moved.target.z-beforeNorth.target.z);
  },{timeout:4000}).toBeGreaterThan(0.25);
  await page.keyboard.up("w");
  await page.locator("#dungeon-compass-reset").click();
  await expect(page.locator("#dungeon-compass-needle")).toHaveCSS("transform","matrix(1, 0, 0, 1, 0, 0)");
  await page.locator("#renderCanvas").focus();
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
  const mapFocus=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveFloorCameraFocus());
  const cameraBefore=await mapFocus();
  await locator.selectOption(ids[2]);
  await expect(locator).toHaveValue(ids[2]);
  await expect(page.locator("#dungeon-hero-detail")).toBeVisible();
  await expect(page.locator("#dungeon-hero-detail-values .hero-card")).toHaveAttribute("data-source","live");
  await expect(page.locator("#dungeon-hero-detail-values .hero-card-item[aria-label='Iron Ore ×1']")).toHaveCount(1);
  await expect(page.locator("#dungeon-hero-detail-values .hero-card-item[aria-label='Coal ×2']")).toHaveCount(1);
  const cameraAfter=await mapFocus();
  expect(cameraAfter.target.x).toBeCloseTo(third.x,2);
  expect(cameraAfter.target.z).toBeCloseTo(third.z,2);
  expect(cameraAfter.offset.x).toBeCloseTo(cameraBefore.offset.x,2);
  expect(cameraAfter.offset.y).toBeCloseTo(cameraBefore.offset.y,2);
  expect(cameraAfter.offset.z).toBeCloseTo(cameraBefore.offset.z,2);
  // The real LIVE minimap now moves only the camera. A selected hero's
  // black fog is a strict boundary even for exact CSS-scaled click targets.
  const minimapTargets=await page.evaluate(async(heroId:string)=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout}=await import(
      "/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {selectLiveFloorSpectatorFrame}=await import(
      "/Dungeon-Shop-Master/src/game/liveFloorSpectator.ts");
    const {selectHeroFloorPerception}=await import(
      "/Dungeon-Shop-Master/src/game/heroPerception.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("Missing actual saved dungeon");
    const layout=generateExpeditionLayout(state.seed,1);
    const frame=selectLiveFloorSpectatorFrame(state,1);
    if(!frame)throw Error("Missing genuine floor projection");
    const hero=frame.heroes.find(member=>member.id===heroId);
    if(!hero)throw Error("Missing actual selected hero");
    const perception=selectHeroFloorPerception(layout,frame,heroId);
    if(!perception)throw Error("Missing real hero perception");
    const known=perception.explored;
    const index=[...known].find(id=>id!==hero.z*layout.width+hero.x);
    const unknown=Array.from({length:layout.width*layout.height},(_,i)=>i)
      .find(id=>!known.has(id));
    if(index===undefined||unknown===undefined)
      throw Error("Required observed/unobserved cells missing");
    return {width:layout.width,height:layout.height,
      hero:{x:hero.x,z:hero.z},
      known:{x:index%layout.width,z:Math.floor(index/layout.width)},
      unknown:{x:unknown%layout.width,z:Math.floor(unknown/layout.width)}};
  },ids[2]);
  const minimap=page.locator("#dungeon-minimap");
  await expect(minimap).toHaveAttribute("tabindex","0");
  const clickMinimap=async(point:{x:number;z:number})=>{
    const bounds=await minimap.boundingBox();
    if(!bounds)throw Error("Minimap should be visible");
    await page.mouse.click(
      bounds.x+(point.x+.5)*bounds.width/minimapTargets.width,
      bounds.y+(point.z+.5)*bounds.height/minimapTargets.height);
  };
  const beforeMinimap=await mapFocus();
  await clickMinimap(minimapTargets.known);
  const afterKnown=await mapFocus();
  expect(afterKnown.target.x).toBeCloseTo(
    (minimapTargets.known.x-(minimapTargets.width-1)/2)*2.5,2);
  expect(afterKnown.target.z).toBeCloseTo(
    (minimapTargets.known.z-(minimapTargets.height-1)/2)*2.5,2);
  expect(afterKnown.offset.x).toBeCloseTo(beforeMinimap.offset.x,3);
  expect(afterKnown.offset.y).toBeCloseTo(beforeMinimap.offset.y,3);
  expect(afterKnown.offset.z).toBeCloseTo(beforeMinimap.offset.z,3);
  await clickMinimap(minimapTargets.unknown);
  expect((await mapFocus()).target).toEqual(afterKnown.target);
  // The keyboard path must use the same fog restrictions and keep orbit.
  const dx=minimapTargets.hero.x-minimapTargets.known.x;
  const dz=minimapTargets.hero.z-minimapTargets.known.z;
  if(Math.abs(dx)+Math.abs(dz)===1){
    await minimap.focus();
    await page.keyboard.press(dx===1?"ArrowRight":dx===-1?
      "ArrowLeft":dz===1?"ArrowDown":"ArrowUp");
    const afterArrow=await mapFocus();
    expect(afterArrow.target.x).toBeCloseTo(third.x,2);
    expect(afterArrow.target.z).toBeCloseTo(third.z,2);
    expect(afterArrow.offset.x).toBeCloseTo(beforeMinimap.offset.x,3);
    expect(afterArrow.offset.y).toBeCloseTo(beforeMinimap.offset.y,3);
    expect(afterArrow.offset.z).toBeCloseTo(beforeMinimap.offset.z,3);
  }
  expect(await record()).toEqual(beforeClick,
    "Minimap camera navigation must never modify saved hero knowledge");
  await locator.selectOption("");
  await expect(page.locator("#dungeon-hero-detail")).toBeHidden();
  expect(await record()).toEqual(beforeClick);
  const clickPoint=await page.evaluate(async(heroId:string)=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .liveFloorHeroClickPoint(heroId),ids[2]);
  await page.locator("#renderCanvas").click({position:clickPoint});
  await expect(page.locator("#dungeon-hero-detail")).toBeVisible();
  const inspected=page.locator("#dungeon-hero-detail-values .hero-card");
  await expect(inspected.locator(".hero-card-gold-icon")).toBeVisible();
  await expect(inspected).toContainText("CURRENT ACTIVITY");
  await expect(inspected).toContainText("Next two steps");
  await expect(inspected).toContainText("visible monsters");
  await expect(inspected).toContainText("heroes seen");
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
