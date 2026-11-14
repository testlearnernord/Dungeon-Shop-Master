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

test("Galvik closes a day by holding E at his bed, then reads the ledger",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#end-day")).toHaveCount(0);
  await expect(page.locator("#day-confirmation")).toHaveCount(0);
  await page.keyboard.press("n");
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
  await expect(page.locator("#ledger-page-content")).toContainText("SALES BY GOOD");
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("The Living");
  const knownBeforeReload=await page.locator(".ledger-hero-list").innerText();
  await expect.poll(()=>page.locator(".ledger-hero-card").count())
    .toBeGreaterThanOrEqual(3);
  expect(await page.locator(".ledger-hero-portrait").count())
    .toBe(await page.locator(".ledger-hero-card").count());
  await expect(page.locator(".ledger-people-overview")).toContainText("SHOP AT CLOSING");
  await expect(page.locator(".ledger-hero-disclosure")).toContainText("remain sealed");
  expect(knownBeforeReload).not.toMatch(/VICTORY|DEFEAT|KILLED|DIED/i);
  await page.locator("#ledger-skip").click();
  await expect(page.locator("#ledger-skip")).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#ledger-skip")).toHaveText("Enable animations");
  // Toggling the animations must not destroy the displayed hero cards.
  expect(await page.locator(".ledger-hero-list").innerText()).toBe(knownBeforeReload);
  await page.locator("#ledger-next").click();
  await expect(page.locator("#ledger-heading")).toHaveText("Sealed Expeditions");
  await expect(page.locator("#ledger-heading")).toBeFocused();
  await expect(page.locator("#ledger-pages")).toHaveText("04 / 04");
  await expect(page.locator("#ledger-next")).toBeDisabled();
  // A reload should restore exactly this folio and preferences, not page 1.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.reload();
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#ledger-heading")).toHaveText("Sealed Expeditions");
  await expect(page.locator("#ledger-skip")).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#ledger-page-content")).toHaveClass(/ledger-no-animation/);
  // A second reload must be identical: no stale session rewrite.
  await page.reload();
  await expect(page.locator("#ledger-heading")).toHaveText("Sealed Expeditions");
  await expect(page.locator("#ledger-skip")).toHaveText("Enable animations");
  await page.keyboard.press("Home");
  await expect(page.locator("#ledger-heading")).toHaveText("The Reckoning");
  await page.keyboard.press("End");
  await expect(page.locator("#ledger-heading")).toHaveText("Sealed Expeditions");
  await page.locator("#ledger-chapters button").nth(2).click();
  await expect(page.locator("#ledger-heading")).toHaveText("The Living");
  expect(await page.locator(".ledger-hero-list").innerText()).toBe(knownBeforeReload);
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

test("book keeps expedition results sealed until the observer watches a replay",async({page})=>{
  await page.goto("./");
  await page.locator("#adventurer-roster .level6-permit").first()
    .evaluate((button:HTMLButtonElement)=>button.click());
  await advanceTestDay(page); // Level 6 departure on day 2
  await expect(page.locator("#day")).toHaveText("Day 2");
  await moveToBed(page);
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:10000});
  await page.keyboard.up("e");
  await page.locator('#ledger-chapters button').last().click();
  const recording=page.locator(".ledger-record").first();
  await expect(recording).toBeVisible();
  await expect(page.locator(".ledger-sealed-overview")).toContainText("SEALED FILES");
  await expect(recording).toHaveAttribute("data-kind","combat");
  await expect(recording).toHaveAttribute("data-floor","6");
  await expect(recording.locator(".ledger-record-title")).toHaveText("THE CAVE TROLL");
  await expect(recording.locator(".ledger-dossier-portrait")).toBeVisible();
  await expect(recording.locator(".ledger-dossier-person-name")).not.toBeEmpty();
  await expect(recording.locator(".ledger-record-seal")).toContainText("SEALED RECORD");
  await expect(recording).not.toContainText(/victory|death|defeat|rare loot|xp gained/i);
  // The archive entry must resolve to the exact saved event that is replayed.
  const recordId=await recording.getAttribute("data-record-id");
  const expectedRecord=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const current=await new CampaignStorage().loadGame();
    return current?.events.find(event=>event.type==="level6-combat"&&
      !!event.combatReplay)?.id??null;
  });
  expect(recordId).toBe(expectedRecord);
  const dayBeforeReplay=await page.locator("#day").innerText();
  await recording.locator(".ledger-watch").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await expect(page.locator("#merchant-ledger")).not.toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  await expect(page.locator(".ledger-record").first()).toHaveAttribute(
    "data-record-id",recordId!);
  await expect(page.locator("#day")).toHaveText(dayBeforeReplay);
  await page.locator("#ledger-begin").click();
  await expect(page.locator("#day")).toHaveText("Day 3");
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
  expect(materials.semanticShelf).toBe("shelf-slot");
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
