import { expect, test } from "@playwright/test";

test("Level 7 saved expedition is replayed with personal fog, seeking, camera and no state mutation",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Construct one real day-tick outcome and persist it through the normal save API,
  // rather than fabricating replay frames or exposing a backdoor in GameStore.
  await page.evaluate(async()=>{
    const {createGameState,advanceDay}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const start=createGameState(7351);
    const prepared={...start,dungeonFloors:[{floor:6,cleared:true}],
      adventurers:start.adventurers.map((hero,i)=>i===0?{
        ...hero,status:"expedition" as const,floor:7 as const,level6Permit:true,
      }:hero)};
    const resolved=advanceDay(prepared).state;
    await new CampaignStorage().saveGame(resolved);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  const gold=await page.locator("#merchant-gold").textContent();
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-hud")).toBeVisible();
  const select=page.locator("#dungeon-replay-select");
  await expect(select.locator("option")).toHaveCount(2);
  await expect(select).not.toHaveValue("preview");
  const selected=await select.inputValue();
  await expect(page.locator("#dungeon-playback-controls")).toBeVisible();
  await expect(page.locator("#dungeon-minimap-heading")).toContainText("Fog of War");
  await expect(page.locator("#dungeon-mode-description")).toContainText("Recorded expedition");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonPlayback());
  await page.locator("#dungeon-play").click();
  await expect(page.locator("#dungeon-play")).toContainText("Play");
  await page.locator("#dungeon-timeline").fill("0");
  const start=await inspect();
  expect(start.replayHero).toBe(true);
  expect(start.hiddenTiles).toBeGreaterThan(500);
  expect(start.shownTiles).toBeGreaterThan(0);
  await expect(page.locator("#dungeon-playback-status")).not.toContainText("Expedition ended");
  await page.locator("#dungeon-timeline").fill("1000");
  await expect(page.locator("#dungeon-playback-status")).toContainText("Expedition ended");
  await page.locator("#dungeon-timeline").fill("0");
  await expect(page.locator("#dungeon-playback-status")).not.toContainText("Expedition ended");
  await page.locator("#dungeon-timeline").fill("900");
  const later=await inspect();
  expect(later.hiddenTiles).toBeLessThan(start.hiddenTiles);
  await page.locator("#dungeon-speed").selectOption("4");
  await page.locator("#dungeon-restart").click();
  await page.keyboard.press("Tab");
  await expect(page.locator("#dungeon-focus")).toContainText("monster");
  await page.keyboard.press("Tab");
  await expect(page.locator("#dungeon-focus")).toContainText("free camera");
  await select.selectOption("preview");
  await expect(page.locator("#dungeon-playback-controls")).toBeHidden();
  await expect(page.locator("#dungeon-minimap-heading")).toContainText("development preview");
  const full=await inspect();
  expect(full.hiddenTiles).toBe(0);
  expect(full.replayHero).toBe(false);
  await select.selectOption(selected);
  await expect(page.locator("#dungeon-playback-controls")).toBeVisible();
  await page.locator("#close-dungeon").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-replay-select")).toHaveValue(selected);
  expect(errors).toEqual([]);
});

test("without recorded Level 7 expeditions, the full developer map remains accessible",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-replay-select")).toHaveValue("preview");
  await expect(page.locator("#dungeon-playback-controls")).toBeHidden();
  await expect(page.locator("#dungeon-summary")).toContainText("monster spawns");
  await page.locator("#close-dungeon").click();
});
