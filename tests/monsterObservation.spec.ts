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
  await expect.poll(async()=>{
    return page.evaluate(async()=>{
      const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
      if(!probe.shopSceneReady())return 0;
      probe.aimAtGalviksTable();
      return probe.inspectGalviksLiveTable().authoredGhouls??0;
    });
  },{timeout:35000,intervals:[300,500,800]}).toBeGreaterThan(0);
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

  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-floor-select")).toHaveValue("1");
  await expect.poll(async()=>(await inspect()).observer,
    {timeout:15000}).toBe("live");
  await expect.poll(async()=>(await inspect()).pins.length,
    {timeout:15000}).toBe(expected.pins.length);
  const live=await inspect();
  for(let index=0;index<expected.pins.length;index++){
    const actual=live.pins[index],ground=expected.pins[index];
    expect(actual.id).toBe(ground.id);
    expect(actual.x).toBeCloseTo(ground.x,3);
    expect(actual.z).toBeCloseTo(ground.z,3);
    expect(actual.enabled).toBe(true);
  }
  expect(live.arrows).toHaveLength(1);
  expect(live.arrows[0].id).toBe(expected.selected);
  expect(live.arrows[0].rgb?.toUpperCase()).toBe("#F44F50");
  expect(live.arrows[0].length).toBeCloseTo(2.5,3);
  expect(pageErrors).toEqual([]);
});
