import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";

/** Startup now includes three baked 384px textures; do not inspect the Babylon
 * scene until the asynchronous shop initialization has finished. */
async function waitForWorld(page:import("@playwright/test").Page){
  await expect.poll(async()=>page.evaluate(async()=>{
    try{
      const scene=await import("/Dungeon-Shop-Master/tests/scene.ts");
      const material=scene.inspectDungeonSurfaces();
      return material.textureCount===3&&
        material.surfaceCount===material.requestedCount&&
        scene.inspectBedroom().exists;
    }catch{return false;}
  }),{timeout:15000}).toBe(true);
}

async function moveToBed(page:import("@playwright/test").Page){
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBed();
  });
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
}

test("Galvik closes a day by holding E at his bed, then reads the ledger @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#end-day")).toHaveCount(0);
  await expect(page.locator("#day-confirmation")).toHaveCount(0);
  // N now intentionally enters shelf construction. Cancel the ghost before
  // interacting with the bed; building must not close the day by itself.
  await page.keyboard.press("n");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await page.keyboard.press("z");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const bedroom=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBedroom());
  expect(bedroom).toEqual({exists:true,collides:true,rearWall:true,oldWall:false});
  await moveToBed(page);
  await page.keyboard.down("e");
  await page.waitForTimeout(350);
  await expect.poll(async()=>Number(await page.locator("#sleep-progress-track").getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  await page.keyboard.up("e");
  await expect.poll(async()=>Number(await page.locator("#sleep-progress-track").getAttribute("aria-valuenow"))).toBe(0);
  await page.waitForTimeout(250);
  await expect(page.locator("#day")).toHaveText("Day 1");

  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#ledger-heading")).toHaveText("The Reckoning");
  await expect(page.locator("#ledger-page-content")).toContainText("GOLD AT DAWN");
  const day2=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.day;
  });
  expect(day2).toBe(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("Goods & Receipts");
  await expect(page.locator("#ledger-page-content")).toContainText("No receipts were posted");
  // Bedtime no longer contains a redundant hero dashboard or a forced
  // sealed-replay chapter. Those belong to the LIVE Board and optional Timeline.
  await expect(page.locator("#ledger-pages")).toHaveText("02 / 02");
  await expect(page.locator("#ledger-chapters button")).toHaveCount(2);
  await expect(page.locator("#ledger-next")).toBeDisabled();
  await expect(page.locator(".ledger-hero-card,.ledger-record")).toHaveCount(0);
  await page.locator("#ledger-skip").click();
  await expect(page.locator("#ledger-skip")).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#ledger-skip")).toHaveText("Enable animations");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.reload();
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#ledger-heading")).toHaveText("Goods & Receipts");
  await expect(page.locator("#ledger-pages")).toHaveText("02 / 02");
  await expect(page.locator("#ledger-skip")).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#ledger-page-content")).toHaveClass(/ledger-no-animation/);
  await page.reload();
  await expect(page.locator("#ledger-heading")).toHaveText("Goods & Receipts");
  await page.keyboard.press("Home");
  await expect(page.locator("#ledger-heading")).toHaveText("The Reckoning");
  await page.keyboard.press("End");
  await expect(page.locator("#ledger-heading")).toHaveText("Goods & Receipts");
  await page.locator("#ledger-chapters button").first().click();
  await expect(page.locator("#ledger-heading")).toHaveText("The Reckoning");
  await page.locator("#ledger-skip").click();
  await expect(page.locator("#ledger-skip")).toHaveText("Skip animations");
  await expect(page.locator("#ledger-skip")).toHaveAttribute("aria-pressed","false");
  await page.locator("#ledger-begin").click();
  await expect(page.locator("#merchant-ledger")).not.toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 2");
  // Repeated key taps cannot advance the day without another full bed hold.
  await page.keyboard.press("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

test("bedtime is accounting only; historical footage stays optional in the live timeline",async({page})=>{
  await page.goto("./");
  await moveToBed(page);
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#ledger-chapters button")).toHaveCount(2);
  await expect(page.locator(".ledger-record,.ledger-hero-card")).toHaveCount(0);
  await page.locator("#ledger-begin").click();
  await expect(page.locator("#merchant-ledger")).toBeHidden();
  await page.locator("#open-archive").click();
  await expect(page.locator("#archive-dialog")).toBeVisible();
  await expect(page.locator("#archive-summary")).toContainText("real highlights");
  await page.locator("#archive-close").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
});

test("player can walk through former rear wall into the bedchamber",async({page})=>{
  await page.goto("./");
  // The shell can be visible before the asynchronous game scene is mounted.
  // Wait for game initialization before using the camera inspection helper.
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectPlayer({x:0,y:1.7,z:-6});
  });
  await page.locator("#renderCanvas").click();
  await page.keyboard.down("s");
  await page.waitForTimeout(1700);
  await page.keyboard.up("s");
  const pos=await page.evaluate(async()=>{
    return (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer();
  });
  expect(pos.z).toBeLessThan(-7.35);
  expect(pos.z).toBeGreaterThan(-12.1);
  expect(pos.collisions&&pos.gravity).toBe(true);
});

test("bedroom dressing preserves the collision-safe alcove and interactable bed",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await waitForWorld(page);
  const room=await page.evaluate(async()=>{
    return (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBedroomAtmosphere();
  });
  // Parenting a movable bed uses Babylon's float32 world matrix; exact
  // decimal equality is not a meaningful placement invariant.
  expect(room.bed.x).toBeCloseTo(0.8,4);
  expect(room.bed.z).toBeCloseTo(-10.6,4);
  expect(room.bed).toMatchObject({collides:true,pickable:true,kind:"bed"});
  expect(room.entryClear).toBe(true);
  expect(room.entrancePiers).toBe(true);
  expect(room.wallSolid).toBe(true);
  expect(room.decorCount).toBe(55);
  expect(room.decorInert).toBe(true);
  expect(room.furniture).toBe(true);
  expect(room.practicalLighting).toBe(true);
  await moveToBed(page);
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

test("bedchamber entrance, sign and bed interaction have separate, solid sightlines",async({page})=>{
  await page.goto("./");
  await waitForWorld(page);
  const probes=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBedroomSightlines());
  expect(probes.rosterX).toBeCloseTo(-5.55,4);
  expect(probes.rightmostFrameX).toBeLessThan(-3.8);
  expect(probes.boardClearOfWall).toBe(true);
  expect(probes.signYaw).toBeCloseTo(Math.PI);
  expect(probes.signZ).toBeGreaterThan(-6.65);
  expect(probes.furnitureHulls.map(hull=>hull.id)).toEqual([
    "chest","desk","candle-stool"]);
  expect(probes.furnitureHulls.every(hull=>
    hull.exists&&hull.solid&&hull.invisible&&hull.unpickable&&
    hull.width>=0.65)).toBe(true);
  expect(probes.wallLeftWidth).toBeGreaterThan(0.8);
  expect(probes.wallRightWidth).toBeGreaterThan(0.8);
  expect(probes.jambsSolid).toBe(true);
  expect(probes.lintelSolid).toBe(true);
  expect(probes.noteZ).toBeGreaterThan(probes.rearRockZ+0.2);

  await moveToBed(page);
  for(const name of ["bedroom-account-book","galvik-bed-chest","bed-candle"]){
    await page.evaluate(async(prop)=>
      (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBedroomProp(prop),name);
    await expect(page.locator("#sleep-bed-prompt")).toBeHidden();
  }
  await page.keyboard.down("e");
  await page.waitForTimeout(1700);
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await moveToBed(page);
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
});

test("shop and sleeping cell reuse textured materials without changing collision or stocking",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await waitForWorld(page);
  await expect(page.locator("#day")).toHaveText("Day 1");
  const materials=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonSurfaces());
  expect(materials.textureCount).toBe(3);
  expect(materials.floorUVMax).toEqual({u:3,v:5});
  expect(materials.surfaceCount).toBe(materials.requestedCount);
  expect(materials.sharedWall).toBe(true);
  expect(materials.sharedTimber).toBe(true);
  expect(materials.sharedFloor).toBe(true);
  expect(materials.semanticShelf).toBeUndefined();
  expect(materials.hasPrebuiltShelf).toBe(false);
  expect(materials.solidWalls).toBe(true);
  expect(materials.idleDecor).toBe(true);
  await moveToBed(page);
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

test("restarted indoor visitors do not jam the doorway after successive day ticks",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // The visual-only positions came from the actual blocked day-3 browser trace.
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).stageReturningNpcVisualsInsideShop();
  });
  const advance=()=>page.evaluate(()=>{
    const tick=(window as Window&{__shopTestAdvanceDay?:()=>void}).__shopTestAdvanceDay;
    if(!tick)throw new Error("Missing E2E day transition");
    tick();
  });
  await advance();
  await advance();
  await expect(page.locator("#day")).toHaveText("Day 3");
  const current=async()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals().visitors);
  const returning=(await current()).filter(v=>
    ["adventurer-1","adventurer-2"].includes(v.id)&&v.status==="at-shop");
  expect(returning.length).toBeGreaterThan(0);
  for(const npc of returning){
    expect(npc.z).toBeLessThan(4.5);
    if(npc.phase==="entering")expect(npc.shoppingPhase).toBe("resuming-in-shop");
  }
  await expect.poll(async()=> (await current()).filter(v=>
    returning.some(n=>n.id===v.id)).every(v=>v.phase!=="entering"),
    {timeout:8000}).toBe(true);
  expect((await current()).filter(v=>returning.some(n=>n.id===v.id))
    .every(v=>v.z<5.4)).toBe(true);
  expect(errors).toEqual([]);
});

test("a paid visitor never respawns on roster changes or extends their visit overnight",async({page})=>{
  test.setTimeout(45000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  const ids=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const initial=withStockedSmallShelf(createGameState(72541));
    const paid=initial.adventurers[0],other=initial.adventurers[1];
    const prepared={...initial,
      adventurers:initial.adventurers.map((hero,index)=>index<2
        ?{...hero,status:"at-shop" as const,floor:5 as const,
          shopStayDays:0,level6Permit:false,gold:100,
          inventory:{...hero.inventory,bread:0,healing:0}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      events:[...initial.events,{
        id:"day-1:"+paid.id+":sale:shelf-1-slot-2:manual",
        type:"sale" as const,saleChannel:"manual" as const,day:1,
        adventurerId:paid.id,itemId:"bread" as const,quantity:1,revenue:4,
        message:paid.name+" paid for Waybread.",
      }],
      shopEconomy:{...initial.shopEconomy,
        slots:initial.shopEconomy.slots.map(slot=>({
          ...slot,itemId:null,quantity:0,
        }))},
    };
    await new CampaignStorage().saveGame(prepared);
    return {paid:paid.id,other:other.id};
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const paidVisual=()=>page.evaluate(async id=>{
    const {inspectNpcVisuals}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return inspectNpcVisuals().visitors.find(hero=>hero.id===id)??null;
  },ids.paid);
  // The visitor has a same-day manual receipt and should complete an exit,
  // not loop through the entrance again because their simulation status
  // remains at-shop until Galvik sleeps.
  await expect.poll(async()=>await paidVisual(),{timeout:12000}).toBeNull();
  // The compact roster is intentionally collapsed in the real HUD.
  // Invoke its actual button click handler rather than waiting for a
  // hidden row to become visible; this still uses GameStore.setLevel6Permit.
  await page.evaluate(otherId=>{
    const button=document.querySelector<HTMLButtonElement>(
      `#adventurer-roster .level6-permit[data-adventurer-id="${otherId}"]`);
    if(!button)throw Error("Missing other visitor's Level 6 permit");
    button.click();
  },ids.other);
  await expect(page.locator(
    `#adventurer-roster .level6-permit[data-adventurer-id="${ids.other}"]`))
    .toHaveAttribute("aria-pressed","true");
  await page.waitForTimeout(800);
  expect(await paidVisual()).toBeNull();
  await page.evaluate(()=>{
    (window as Window&{__shopTestAdvanceDay?:()=>void}).__shopTestAdvanceDay?.();
  });
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect.poll(async()=>page.evaluate(async id=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state||state.day!==2)return null;
    const hero=state.adventurers.find(person=>person.id===id);
    return {status:hero?.status,floor:hero?.floor,
      stayed:state.events.some(e=>e.day===2&&e.adventurerId===id&&e.type==="shop-stay"),
      departed:state.events.some(e=>e.day===2&&e.adventurerId===id&&e.type==="shop-departure")};
  },ids.paid),{timeout:12000}).toEqual({
    status:"returning",floor:4,stayed:false,departed:true,
  });
  expect(await paidVisual()).toBeNull();
  expect(errors).toEqual([]);
});
