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
  const roomArt=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonRoomArt());
  const tableArt=await roomArt();
  expect(new Set(tableArt.filter(p=>p.id.startsWith("room-")).map(p=>p.theme)).size).toBe(4);
  expect(tableArt.filter(p=>p.id.startsWith("dungeon-passage-art-")).length).toBeGreaterThan(0);
  expect(tableArt.flatMap(p=>p.props).some(p=>p.name.includes("wall-frame"))).toBe(true);
  expect(tableArt.flatMap(p=>p.props).length).toBeGreaterThan(12);
  expect(tableArt.flatMap(p=>p.props).every(p=>!p.pickable&&!p.collides)).toBe(true);
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
  expect(table.authoredClips).toContain("idle_combat");
  expect(table.authoredClips.some(name=>name.includes(
    "A feral ghoul walks with a hunched back"))).toBe(true);
  for(const pin of table.pins){
    expect(pin.clip).toBe("idle_combat");
    expect(pin.idleModel).toBe(true);
    expect(pin.walkModel).toBe(false);
    expect(pin.sourceId).not.toBe(pin.walkSourceId);
  }

  // Two authentic 100-tick monster movement intervals move the Ghoul on its pre-saved
  // connected route. The table gets the FIRST step, then the full LIVE
  // map observes the SECOND. Never mutate Babylon markers directly.
  const nextMonsterStep=()=>page.evaluate(()=>{
    const hooks=window as Window&{
      __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
    };
    if(!hooks.__shopTestAdvanceWorldTicks)
      throw Error("Missing real authoritative E2E clock hook");
    hooks.__shopTestAdvanceWorldTicks(100);
  });
  const selected=async()=>(
    await inspect()).pins.find(pin=>pin.id===expected.selected);
  const phases=()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return probe.observedGhoulAnimationPhases();
  });
  const arm=()=>page.evaluate(async id=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    probe.armGhoulObservationAnimationProbe(id);
  },expected.selected);
  // A real 1.2-second animation advances by bounded RENDER deltas. Slow
  // CI software GL can need many seconds to draw twelve frames; requiring
  // a wall-clock 4.5s Idle deadline is not a gameplay correctness test.
  const renderedWalkThenIdle=async()=>{
    const frames=await phases();
    const firstWalk=frames.findIndex(p=>
      p.phase==="walk"&&p.walk&&!p.idle);
    return firstWalk>=0&&frames.slice(firstWalk+1).some(p=>
      p.phase==="idle"&&p.idle&&!p.walk);
  };
  await arm();
  await nextMonsterStep();
  // Use ACTUAL browser render frames, not a late Playwright snapshot after
  // a short 1.2-second animation, which under slow CI can miss the walk.
  await expect.poll(async()=> (await phases()).some(p=>
    p.phase==="walk"&&p.walk&&!p.idle),
    {timeout:15000,intervals:[125,175,250]}).toBe(true);
  const tableWalking=(await phases()).find(p=>p.phase==="walk");
  expect(tableWalking?.clip).toBe("walk_feral");
  expect(tableWalking?.walk).toBe(true);
  expect(tableWalking?.idle).toBe(false);
  await expect.poll(renderedWalkThenIdle,
    {timeout:15000,intervals:[150,250,350]}).toBe(true);
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
  await expect.poll(async()=>page.evaluate(async()=>{
    const probe=await import("/Dungeon-Shop-Master/tests/scene.ts");
    const result=probe.dungeonRoomTextureProbe();
    return result.shared&&result.ready&&result.visibleRooms>0;
  }),{timeout:15000}).toBe(true);
  expect(await roomArt()).toEqual(tableArt);
  // Sample an actual unoccupied vault tile in the north-up canvas and
  // hover that same CSS cell, not a mock projection or a synthetic label.
  const roomSample=await page.evaluate(async()=>{
    const {generateExpeditionLayout,dungeonRoomCells}=await import("/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {dungeonRoomArtPlan,ROOM_OVERVIEW_COLORS}=await import("/Dungeon-Shop-Master/src/game/dungeonRoomArtPlan.ts");
    const {dungeonTileMinimapPixel}=await import("/Dungeon-Shop-Master/src/game/dungeonObservationOrientation.ts");
    const layout=generateExpeditionLayout(7351,1);
    const vault=dungeonRoomArtPlan(layout).find(p=>p.theme==="vault")!;
    const cell=dungeonRoomCells(layout,vault.room)[0];
    const canvas=document.querySelector<HTMLCanvasElement>("#dungeon-minimap")!;
    const pixel=dungeonTileMinimapPixel(cell,layout.height,6);
    // Outer cell corner is terrain, even when a feature occupies its center.
    const rgb=Array.from(canvas.getContext("2d")!.getImageData(pixel.x,pixel.y,1,1).data).slice(0,3);
    const hex="#"+rgb.map(v=>v.toString(16).padStart(2,"0")).join("");
    const rect=canvas.getBoundingClientRect();
    return {hex,expected:ROOM_OVERVIEW_COLORS.vault,
      x:rect.left+(pixel.x+3)/canvas.width*rect.width,
      y:rect.top+(pixel.y+3)/canvas.height*rect.height};
  });
  expect(roomSample.hex).toBe(roomSample.expected);
  await page.mouse.move(roomSample.x,roomSample.y);
  await expect(page.locator("#dungeon-hover-tooltip")).toContainText("Treasure Vault");
  await expect(page.locator("#dungeon-hover-tooltip")).toContainText("2–3 ordinary goods");
  const live=await inspect();
  const afterFirst=expected.pins.map(pin=>
    pin.id===expected.selected?{...pin,...expected.first}:pin);
  expect(live.authoredRigCount).toBe(2);
  expect(live.authoredClips).toContain("idle_combat");
  expect(live.authoredClips.some(name=>name.includes(
    "A feral ghoul walks with a hunched back"))).toBe(true);
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

  await arm();
  await nextMonsterStep();
  await expect.poll(async()=> (await phases()).some(p=>
    p.phase==="walk"&&p.walk&&!p.idle),
    {timeout:15000,intervals:[125,175,250]}).toBe(true);
  const liveWalking=(await phases()).find(p=>p.phase==="walk");
  expect(liveWalking?.clip).toBe("walk_feral");
  expect(liveWalking?.walk).toBe(true);
  expect(liveWalking?.idle).toBe(false);
  await expect.poll(renderedWalkThenIdle,
    {timeout:15000,intervals:[150,250,350]}).toBe(true);
  const liveArrived=await selected();
  expect(liveArrived?.idleModel).toBe(true);
  expect(liveArrived?.walkModel).toBe(false);
  expect(liveArrived?.x).toBeCloseTo(expected.second.x,3);
  expect(liveArrived?.z).toBeCloseTo(expected.second.z,3);
  expect(pageErrors).toEqual([]);
});
