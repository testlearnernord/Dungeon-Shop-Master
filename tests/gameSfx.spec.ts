import { expect, test } from "@playwright/test";

test("independent SFX mute and volume survive reload and boss viewer lifecycle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  await page.locator("#sfx-toggle").click();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX off");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await page.locator("#sfx-volume").evaluate((slider: HTMLInputElement) => {
    slider.value = "27";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX off");
  await expect(page.locator("#sfx-volume")).toHaveValue("27");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");

  const gold = await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#sfx-toggle").click();
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  // Arena shortcuts intentionally ignore focused audio controls.
  await page.locator("#sfx-toggle").evaluate((button: HTMLButtonElement) => button.blur());
  await page.keyboard.press("Space");
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-model-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await page.locator("#close-arena").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#sfx-toggle")).toHaveText("SFX on");
  expect(errors).toEqual([]);
});


test("SFX Lab is preview-only, supports independent solo/mute and cue audition",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#arena-sfx-debug-toggle")).toBeHidden();
  const originalGold=await page.locator("#merchant-gold").textContent();
  await page.keyboard.press("v");
  await expect(page.locator("#arena-preview")).toContainText("TRAINING PREVIEW");
  await expect(page.locator("#arena-sfx-debug-toggle")).toBeVisible();
  await expect(page.locator("#arena-sfx-debug")).toBeHidden();
  await page.locator("#arena-sfx-debug-toggle").click();
  await expect(page.locator("#arena-sfx-debug")).toBeVisible();

  const soloTroll=page.locator('#arena-sfx-debug [data-axis="owner"][data-id="troll"][data-mode="solo"]');
  const muteHero=page.locator('#arena-sfx-debug [data-axis="owner"][data-id="hero"][data-mode="mute"]');
  const soloMelee=page.locator('#arena-sfx-debug [data-axis="family"][data-id="melee"][data-mode="solo"]');
  const muteWorld=page.locator('#arena-sfx-debug [data-axis="owner"][data-id="world"][data-mode="mute"]');
  await soloTroll.click();
  await expect(soloTroll).toHaveAttribute("aria-pressed","true");
  await muteHero.click();
  await expect(muteHero).toHaveAttribute("aria-pressed","true");
  await soloMelee.click();
  await expect(soloMelee).toHaveAttribute("aria-pressed","true");
  await muteWorld.click();
  await expect(page.locator("#arena-sfx-debug-ambient")).toContainText("filtered");

  await page.locator(".sfx-debug-library summary").click();
  await expect(page.locator("#arena-sfx-debug-auditions button")).toHaveCount(19);
  await page.locator('#arena-sfx-debug-auditions [data-cue="projectile"]').click();
  await expect(page.locator('#arena-sfx-debug-events li[data-cue="projectile"]').first())
    .toContainText("[TEST]");
  await page.locator("#arena-sfx-debug-reset").click();
  await expect(soloTroll).toHaveAttribute("aria-pressed","false");
  await expect(muteHero).toHaveAttribute("aria-pressed","false");
  await expect(soloMelee).toHaveAttribute("aria-pressed","false");
  await expect(page.locator("#arena-sfx-debug-ambient")).toContainText("allowed");
  // Closing preview must clear isolation so saved replays/shop stay unfiltered.
  await page.locator("#close-arena").click();
  await expect(page.locator("#arena-sfx-debug-toggle")).toBeHidden();
  await expect(page.locator("#arena-sfx-debug")).toBeHidden();
  await expect(page.locator("#merchant-gold")).toHaveText(originalGold!);
  await page.keyboard.press("v");
  await page.locator("#arena-sfx-debug-toggle").click();
  await expect(soloTroll).toHaveAttribute("aria-pressed","false");
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-sfx-debug-toggle")).toBeHidden();
  await expect(page.locator("#arena-sfx-debug")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-sfx-debug-toggle")).toBeVisible();
  await page.locator("#close-arena").click();
  expect(errors).toEqual([]);
});

test("curated Troll MP3s resolve under the deployed base path",async({page})=>{
  await page.goto("./");
  for(const file of ["cave-troll-intro-roar-v1.mp3",
    "cave-troll-fist-impact-short-v1.mp3","cave-troll-windup-grunt-a.mp3"]){
    const response=await page.request.get("./audio/sfx/cave-troll/"+file);
    expect(response.ok(),file).toBe(true);
    expect(response.headers()["content-type"]).toContain("audio/");
  }
  await page.keyboard.press("v");
  await page.locator("#arena-sfx-debug-toggle").click();
  await expect(page.locator('#arena-sfx-debug-auditions [data-cue="troll-roar"]')).toContainText("MP3");
  await expect(page.locator('#arena-sfx-debug-auditions [data-cue="troll-death"]')).toContainText("synth");
});
