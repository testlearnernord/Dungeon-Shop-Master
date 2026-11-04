import { expect, test } from "@playwright/test";

test("Level 7 renders a deterministic 3D dungeon and spectator camera without modifying gameplay", async ({page}) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const gold=await page.locator("#merchant-gold").textContent();
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonLayout());
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-hud")).toBeVisible();
  await page.waitForTimeout(250);
  expect(errors, "The 3D scene construction must not throw").toEqual([]);
  await expect(page.locator("#dungeon-summary")).toContainText("monster spawns");
  await expect(page.locator("#dungeon-focus")).toContainText("Entrance");
  await expect(page.locator("#music-track")).toHaveText("Beneath the Surface");
  const before=await inspect();
  expect(before.wallCount).toBeGreaterThan(150);
  expect(before.floorCount).toBeGreaterThan(150);
  expect(before.monsters).toBeGreaterThanOrEqual(4);
  expect(before.treasures).toBeGreaterThanOrEqual(4);
  expect(before.traps).toBeGreaterThanOrEqual(4);
  expect(before.heroReference).toBe(true);
  expect(before.mapWidth).toBe(186);
  await page.keyboard.down("d");
  // Assert actual rendered movement, independent of slow/contended CI GPUs.
  await expect.poll(async()=>(await inspect()).camera.x,
    {timeout:15000}).toBeGreaterThan(before.camera.x+1);
  await page.keyboard.up("d");
  const moved=await inspect();
  expect(moved.camera.x).toBeGreaterThan(before.camera.x+1);
  await page.keyboard.press("Tab");
  await expect(page.locator("#dungeon-focus")).toContainText("Room");
  await page.keyboard.press("r");
  await expect(page.locator("#dungeon-focus")).toContainText("Entrance");
  await page.keyboard.press("v");
  await expect(page.locator("#dungeon-hud")).toBeVisible();
  await expect(page.locator("#arena-hud")).toBeHidden();
  await page.keyboard.press("g");
  await expect(page.locator("#dungeon-hud")).toBeHidden();
  await expect(page.locator("#music-track")).toHaveText("The Last Warm Light");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-hud")).toBeVisible();
  await page.keyboard.press("g");
  await expect(page.locator("#arena-hud")).toBeVisible();
  await expect(page.locator("#dungeon-hud")).toBeHidden();
  await page.locator("#close-arena").click();
  expect(errors).toEqual([]);
});

test("Level 7 map seed survives new days and reloading campaign, and never consumes tick RNG",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-dungeon").click();
  const seed=await page.locator("#dungeon-seed").textContent();
  const summary=await page.locator("#dungeon-summary").textContent();
  await page.locator("#close-dungeon").click();
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-seed")).toHaveText(seed!);
  await expect(page.locator("#dungeon-summary")).toHaveText(summary!);
  await page.locator("#close-dungeon").click();
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.locator("#open-dungeon").click();
  await expect(page.locator("#dungeon-seed")).toHaveText(seed!);
  await expect(page.locator("#dungeon-summary")).toHaveText(summary!);
  await page.locator("#close-dungeon").click();
});
