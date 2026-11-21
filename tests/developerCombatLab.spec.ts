import {expect,test} from "@playwright/test";

test("V developer lab swaps real 3-Ghoul fights, stage, hero stats and frame stepping without campaign writes @ci-smoke",async({page})=>{
  test.setTimeout(115000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const gold=await page.locator("#merchant-gold").textContent();
  // Wait for the initial asynchronous persistence UI to settle. A
  // completed save message is not itself proof of a gameplay mutation.
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const save="Saved Day 1.";
  await page.locator("#open-arena").click();
  await page.locator("#arena-lab-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-dev-lab","true");
  await expect(page.locator("#arena-lab-panel")).toBeVisible();
  await page.locator("#lab-enemy").selectOption("ghoul");
  await page.locator("#lab-enemy-count").selectOption("3");
  await page.locator("#lab-arena").selectOption("crypt");
  await page.locator("#lab-hero-count").selectOption("3");
  await page.locator("#lab-hero-slot").selectOption("1");
  await page.locator("#lab-hero-role").selectOption("healer");
  await page.locator("#lab-hero-hp").fill("321");
  await page.locator("#lab-hero-damage").fill("17");
  await page.locator("#lab-start").click();
  const summary=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectLiveCombatPresentation());
  await expect.poll(async()=>(await summary()).arenaMonsters).toBe(3);
  expect((await summary()).arenaHeroes).toBe(3);
  expect((await summary()).isArena).toBe(true);
  expect((await summary()).legacyMonsterPlaceholders).toBe(0);
  await page.locator("#lab-pause").click();
  await page.locator("#lab-step").click();
  await expect(page.locator("#lab-status")).toContainText("0.02s");
  await page.locator("#lab-enemy").selectOption("cave-troll");
  await expect(page.locator("#lab-enemy-count")).toHaveValue("1");
  await page.locator("#lab-arena").selectOption("cave-troll");
  await page.locator("#lab-start").click();
  await expect.poll(async()=>(await summary()).arenaMonsters).toBe(1);
  await expect(page.locator(".group-combat-cinematic")).toBeVisible();
  await expect(page.locator(".group-combat-cinematic strong")).toHaveText(
    "THE ASHEN TUNNEL MAULER");
  await expect(page.locator("#group-combat-world-hud"))
    .toHaveCSS("visibility","hidden");
  const trollScene=await summary();
  expect(trollScene.trollImpactDustCount).toBe(1);
  expect(trollScene.trollDebrisCount).toBe(16);
  expect(trollScene.trollWarningSectorCount).toBe(2);
  expect(trollScene.trollImpactFlashCount).toBe(1);
  await page.locator("#lab-model").click();
  await expect(page.locator(".group-combat-cinematic")).toHaveCount(0);
  await expect(page.locator("#arena-model-panel")).toBeVisible();
  await page.locator("#arena-model-preset").selectOption("ghoul-tripo");
  await expect(page.locator("#arena-model-info")).toContainText("15 imported clips",{timeout:30000});
  await expect(page.locator("#arena-model-clip option")).toHaveCount(15);
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-lab-panel")).toBeVisible();
  await page.locator("#arena-lab-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-dev-lab","false");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#save-status")).toHaveText(save!);
  await expect(page.locator("#day")).toHaveText("Day 1");
  expect(errors).toEqual([]);
});
