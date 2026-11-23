import {expect,test} from "@playwright/test";

/** Browser acceptance of actual Babylon meshes in both observers. This test
 * saves an authentic deterministic monster-world snapshot, reloads the real
 * app and reads rendered node positions. No mock WebGL, spectator-only pack
 * fabrication or invented gameplay movement. */
test("Galvik's Table and LIVE dungeon show the same saved Ghouls and one red tile @ci-smoke",
  async({page})=>{
  test.setTimeout(120000);
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("./?e2e-pause-world=1");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const expected=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath}
      =await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {emptySpatialDungeonWorld}
      =await import("/Dungeon-Shop-Master/src/game/spatialDungeonExploration.ts");
    const {advanceDungeonMonsterWorld}
      =await import("/Dungeon-Shop-Master/src/game/dungeonMonsterWorld.ts");
    const start=createGameState(7351);
    // No roaming party changes the deterministic two-step demonstration.
    // The monster still moves through the real LIVE world event scheduler.
    const store=new GameStore({...start,adventurers:
      start.adventurers.map(hero=>({...hero,status:"at-shop" as const,
        floor:"shop" as const,shopStayDays:0}))});
    store.enableLiveDungeon();
    const layout=generateExpeditionLayout(7351,1);
    const floorWorld=advanceDungeonMonsterWorld(
      emptySpatialDungeonWorld(),layout,1,0);
    const packs=floorWorld.monsters??[];
    // Pick a real connected TWO-tile route. Each tile must be unoccupied so
    // we can observe one committed step at the table and the next in LIVE.
    const busy=(point:{x:number;z:number},id:string)=>packs.some(
      other=>other.id!==id&&other.x===point.x&&other.z===point.z);
    const routes=packs.flatMap(pack=>dungeonNeighbors(layout,pack)
      .flatMap(first=>dungeonNeighbors(layout,first).flatMap(target=>{
        const route=dungeonShortestPath(layout,pack,target);
        return route.length===3&&
          route[1].x===first.x&&route[1].z===first.z&&
          !busy(first,pack.id)&&!busy(target,pack.id)
          ?[{pack,target,first}]:[];
      })));
    const chosen=routes[0];
    if(!chosen)throw new Error("Seeded map has no clear two-tile Ghoul route");
    const world={...floorWorld,monsters:packs.map(pack=>
      pack.id===chosen.pack.id?{
        ...pack,mode:"ROAMING" as const,target:chosen.target,
      }:pack)};
    const seeded={...store.state,dungeonWorlds:[
      ...store.state.dungeonWorlds.filter(f=>f.floor!==1),
      {floor:1 as const,world},
    ]};
    await new CampaignStorage().saveGame(seeded);
    return {
      selected:chosen.pack.id,
      first:{x:(chosen.first.x-(layout.width-1)/2)*2.5,
        z:(chosen.first.z-(layout.height-1)/2)*2.5},
      second:{x:(chosen.target.x-(layout.width-1)/2)*2.5,
        z:(chosen.target.z-(layout.height-1)/2)*2.5},
      pins:packs.map(pack=>({
        id:pack.id,x:(pack.x-(layout.width-1)/2)*2.5,
        z:(pack.z-(layout.height-1)/2)*2.5,
      })).sort((a,b)=>a.id.localeCompare(b.id)),
    };
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return probe.inspectGhoulObservationMeshes();
  });
  await expect.poll(async()=>JSON.stringify(await page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    if(!probe.shopSceneReady())return {ready:false,reason:"shop boot"};
    probe.aimAtGalviksTable();
    const table=probe.inspectGalviksLiveTable();
    const mesh=probe.inspectGhoulObservationMeshes();
    return {
      ready:(table.authoredGhouls??0)>0,
      authoredGhouls:table.authoredGhouls,
      rigs:mesh.authoredRigCount,
      clips:mesh.authoredClips,
      errors:mesh.pins.map(pin=>pin.assetError).filter(Boolean),
    };
  })),{timeout:35000,intervals:[300,500,800]}).toContain('"ready":true');
  await expect.poll(async()=>(await inspect()).pins.length,
    {timeout:15000}).toBe(expected.pins.length);
  const table=await inspect();
  expect(table.observer).toBe("table");
  for(let index=0;index<expected.pins.length;index++){
    const actual=table.pins[index],ground=expected.pins[index];
    expect(actual.id).toBe(ground.id);
    expect(actual.x).toBeCloseTo(ground.x,3);
    expect(actual.z).toBeCloseTo(ground.z,3);
    expect(actual.enabled).toBe(true);
  }
  expect(table.arrows).toHaveLength(1);
  expect(table.arrows[0].id).toBe(expected.selected);
  expect(table.arrows[0].enabled).toBe(true);
  expect(table.arrows[0].rgb?.toUpperCase()).toBe("#F44F50");
  expect(table.arrows[0].length).toBeCloseTo(2.5,3);
  expect(table.authoredRigCount).toBe(2);
  expect(table.authoredClips).toEqual(expect.arrayContaining([
    "idle_combat","overview-walking-walk_feral",
  ]));
  for(const pin of table.pins){
    expect(pin.clip).toBe("idle_combat");
    expect(pin.idleModel).toBe(true);
    expect(pin.walkModel).toBe(false);
    expect(pin.sourceId).not.toBe(pin.walkSourceId);
  }

  // Two authentic 400-tick LIVE events move the Ghoul on its pre-saved
  // connected route. The table gets the FIRST step, then the full LIVE
  // map observes the SECOND. Never mutate Babylon markers directly.
  const nextMonsterStep=()=>page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
    };
    if(!hooks.__shopTestAdvanceWorldTicks)
      throw Error("Missing real authoritative E2E clock hook");
    hooks.__shopTestAdvanceWorldTicks(400);
  });
  const selected=async()=>(
    await inspect()).pins.find(pin=>pin.id===expected.selected);
  await nextMonsterStep();
  await expect.poll(async()=> (await selected())?.phase,
    {timeout:5000,intervals:[100,150,200]}).toBe("walk");
  const tableWalking=await selected();
  expect(tableWalking?.clip).toBe("walk_feral");
  expect(tableWalking?.walkModel).toBe(true);
  expect(tableWalking?.idleModel).toBe(false);
  await expect.poll(async()=> (await selected())?.phase,
    {timeout:4500,intervals:[150,200]}).toBe("idle");
  const tableArrived=await selected();
  expect(tableArrived?.idleModel).toBe(true);
  expect(tableArrived?.walkModel).toBe(false);
  expect(tableArrived?.x).toBeCloseTo(expected.first.x,3);
  expect(tableArrived?.z).toBeCloseTo(expected.first.z,3);

  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("1");
  await expect.poll(async()=>(await inspect()).observer,
    {timeout:15000}).toBe("live");
  await expect.poll(async()=>(await inspect()).pins.length,
    {timeout:15000}).toBe(expected.pins.length);
  const live=await inspect();
  const afterFirst=expected.pins.map(pin=>
    pin.id===expected.selected?{...pin,...expected.first}:pin);
  expect(live.authoredRigCount).toBe(2);
  expect(live.authoredClips).toEqual(expect.arrayContaining([
    "idle_combat","overview-walking-walk_feral",
  ]));
  for(let index=0;index<afterFirst.length;index++){
    const actual=live.pins[index],ground=afterFirst[index];
    expect(actual.id).toBe(ground.id);
    expect(actual.x).toBeCloseTo(ground.x,3);
    expect(actual.z).toBeCloseTo(ground.z,3);
    expect(actual.enabled).toBe(true);
  }
  expect(live.arrows).toHaveLength(1);
  expect(live.arrows[0].id).toBe(expected.selected);
  expect(live.arrows[0].rgb?.toUpperCase()).toBe("#F44F50");
  expect(live.arrows[0].length).toBeCloseTo(2.5,3);
  for(const pin of live.pins){
    expect(pin.clip).toBe("idle_combat");
    expect(pin.idleModel).toBe(true);
    expect(pin.walkModel).toBe(false);
  }

  await nextMonsterStep();
  await expect.poll(async()=> (await selected())?.phase,
    {timeout:5000,intervals:[100,150,200]}).toBe("walk");
  const liveWalking=await selected();
  expect(liveWalking?.clip).toBe("walk_feral");
  expect(liveWalking?.walkModel).toBe(true);
  expect(liveWalking?.idleModel).toBe(false);
  await expect.poll(async()=> (await selected())?.phase,
    {timeout:4500,intervals:[150,200]}).toBe("idle");
  const liveArrived=await selected();
  expect(liveArrived?.idleModel).toBe(true);
  expect(liveArrived?.walkModel).toBe(false);
  expect(liveArrived?.x).toBeCloseTo(expected.second.x,3);
  expect(liveArrived?.z).toBeCloseTo(expected.second.z,3);
  expect(pageErrors).toEqual([]);
});
