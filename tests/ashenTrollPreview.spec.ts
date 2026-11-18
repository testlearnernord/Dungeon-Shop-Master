import {expect,test} from "@playwright/test";

test("Ashen Tunnel Mauler has real animated geometry in the V training preview",async({page},testInfo)=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await page.setViewportSize({width:1440,height:900});
  const startingGold=await page.locator("#merchant-gold").textContent();
  await expect(page.locator("#day")).toHaveText("Day 1");
  // This is the actual in-game, read-only Level 6 training preview.
  await page.keyboard.press("v");
  await expect(page.locator("#arena-preview")).toContainText("TRAINING PREVIEW");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await expect(page.locator(".arena-bottom")).toBeHidden();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","true");
  const initial=await inspect();
  expect(initial.heroPosition?.z).toBe(-9);
  expect(initial.bossPosition?.z).toBe(2);
  // The Ashen Mauler's modeled face is +Z, so its initial world-space
  // heading must point toward the hero at -Z *during* the camera intro.
  expect(initial.bossFacingHero).toBeGreaterThan(.98);
  expect(initial.bossPhase).toBeUndefined();
  // Visual-only rocks and flash exist once and are silent during the intro.
  expect(initial.impactDebrisCount).toBe(16);
  expect(initial.impactFlashIntensity).toBe(0);
  // Check the cinema hold immediately, before any slow MP3 / GLB download
  // can allow the 13.5s intro to finish on a busy CI runner.
  await page.waitForTimeout(350);
  const duringIntro=await inspect();
  expect(duringIntro.heroPosition).toEqual(initial.heroPosition);
  expect(duringIntro.bossPosition).toEqual(initial.bossPosition);
  expect(duringIntro.bossPhase).toBeUndefined();
  expect(duringIntro.bossFacingHero).toBeGreaterThan(.98);
  expect(initial.trollVisualId).toBe("ashen-tunnel-mauler");
  // Skip correctly seeks the score to its 13.5-second attack peak,
  // then starts the unchanged preview motor on its original first frame.
  await page.keyboard.press("Space");
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","false");
  await expect(page.locator("#arena-world-hud")).toBeVisible();
  await expect(page.locator("#arena-hero-bar-label")).toContainText("HERO");
  await expect(page.locator("#arena-boss-bar-label")).toContainText("CAVE TROLL");
  expect((await inspect()).bossFacingHero).toBeGreaterThan(.98);
  // Pose must be produced by the real preview motor, not by a static loop.
  await expect.poll(async()=> (await inspect()).bossPhase,
    {timeout:20000,intervals:[100,200,200]}).toBe("windup");
  // The 60Hz encounter can finish or enter its next phase before the
  // Playwright polling window on loaded CI runners. Check live pose data
  // is finite here; the isolated rig test below verifies the full
  // windup-to-impact swing and its magnitude deterministically.
  expect(Number.isFinite((await inspect()).trollHammerRotation)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("ashen-mauler-training-preview.png")});
  await page.keyboard.press("Tab"); // actual spectator switch to boss focus
  await expect(page.locator("#arena-focus")).toContainText("CAVE TROLL");
  await page.screenshot({path:testInfo.outputPath("ashen-mauler-boss-closeup.png")});


  // The real asset and MP3 can be fetched after the timing-sensitive
  // cinematic assertions: they must not accidentally advance the intro.
  await expect.poll(async()=>(await inspect()).sculptStatus,
    {timeout:15000,intervals:[150,250,400]}).toBe("ready");
  const sculpted=await inspect();
  expect(sculpted.sculptedPartCount).toBe(17);
  expect(sculpted.opaqueSculptPartCount).toBe(17);
  expect(sculpted.scalpTuftCount).toBe(19);
  expect(sculpted.jowlFurCount).toBe(14);
  expect(sculpted.apronVertexCount).toBeGreaterThan(100);
  expect(sculpted.roundedShoulderVertices).toBeGreaterThan(100);
  expect(sculpted.sculptSourceUrl).toBe(
    "/Dungeon-Shop-Master/assets/models/ashen-mauler-sculpt.glb");
  const sculpt=await page.request.get(sculpted.sculptSourceUrl!);
  expect(sculpt.ok()).toBe(true);
  const geometry=await sculpt.body();
  expect(geometry.byteLength).toBeGreaterThan(100_000);
  expect(geometry.subarray(0,4).toString("ascii")).toBe("glTF");
  await expect(page.locator("#music-track")).toHaveText("Desperate Measures");
  const musicUrl=await page.locator("#music-boss-audio").evaluate(
    (audio:HTMLAudioElement)=>audio.src);
  expect(musicUrl).toMatch(/\/Dungeon-Shop-Master\/audio\/desperate-measures\.mp3$/);
  const track=await page.request.get(musicUrl);
  expect(track.ok()).toBe(true);
  expect(track.headers()["content-type"]).toMatch(/audio\/mpeg/i);
  const bytes=await track.body();
  expect(bytes.byteLength).toBeGreaterThan(1_000_000);
  const hasId3=bytes.subarray(0,3).toString("ascii")==="ID3";
  const hasFrame=bytes[0]===0xff&&((bytes[1]??0)&0xe0)===0xe0;
  expect(hasId3||hasFrame).toBe(true);

  // Death is a noninstant sequence, tested on an isolated visual-only rig,
  // without artificially mutating the real campaign or replay frames.
  const death=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCaveTrollDeathPose());
  expect(death.fall).toBeGreaterThan(.95);
  expect(death.weapon).toBeGreaterThan(.85);
  expect(death.elapsed).toBeGreaterThan(1.6);
  const locomotion=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCaveTrollMotion());
  expect(locomotion.gaitMeters).toBeGreaterThan(5);
  expect(locomotion.footMinimum).toBeCloseTo(.30,1);
  expect(locomotion.footMaximum-locomotion.footMinimum).toBeGreaterThan(.20);
  expect(locomotion.windup).toBeLessThan(-.8);
  expect(locomotion.strike-locomotion.windup).toBeGreaterThan(.85);
  expect(locomotion.liftAtWindup).toBeGreaterThan(.5);
  expect(locomotion.jawAtWindup).toBeGreaterThan(.25);
  expect(locomotion.contactCompression).toBeGreaterThan(.08);
  expect(locomotion.recoveredCompression).toBe(0);

  // Restart clears all scene-owned meshes and reconstructs the same boss.
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-boss-health")).toContainText("280/280");
  const restarted=await inspect();
  expect(restarted.trollMeshCount).toBe(initial.trollMeshCount);
  expect(restarted.bossFacingHero).toBeGreaterThan(.98);
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-hud")).toBeHidden();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(startingGold!);
  expect(errors).toEqual([]);
});


test("experimental Tripo boss uses live Level 6 motor while preserving the original @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#merchant-gold")).toContainText("Merchant gold:");
  const gold=await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  const scenario=await page.locator("#arena-hud").getAttribute("data-training-scenario");
  await page.locator("#arena-tripo-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-boss-renderer","tripo");
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-training-scenario",scenario!);
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  await expect.poll(async()=>(await inspect()).tripoStatus,{timeout:40000}).toBe("ready");
  const imported=await inspect();
  expect(imported.trollVisualId).toBe("ashen-tunnel-mauler-tripo");
  expect(imported.tripoBoneCount).toBe(65);
  expect(imported.tripoClipCount).toBe(14);
  expect(imported.tripoGripReady).toBe(true);
  expect(imported.tripoGripAnchor).toBe("mixamorig:LeftHand");
  expect(imported.tripoFacingCorrectionRadians).toBe(0);
  expect(imported.tripoWeaponMeshCount).toBe(0);
  expect(imported.tripoWeaponMode).toBe("unarmed");
  expect(imported.bossFacingHero).toBeGreaterThan(.98);
  await page.keyboard.press("Space");
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  await expect.poll(async()=>(await inspect()).bossPhase,{timeout:20000}).toBe("windup");
  const animated=await inspect();
  expect(["walk_heavy","idle_combat","attack_2h_swing"])
    .toContain(animated.tripoClip);
  await page.locator("#arena-tripo-toggle").click();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-boss-renderer","legacy");
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-training-scenario",scenario!);
  expect((await inspect()).trollVisualId).toBe("ashen-tunnel-mauler");
  await page.locator("#arena-model-toggle").click();
  await expect(page.locator("#arena-model-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-model-panel")).toBeHidden();
  await page.locator("#close-arena").click();
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  await expect(page.locator("#day")).toHaveText("Day 1");
  expect(errors).toEqual([]);
});

test("a playing Desperate Measures playhead starts the duel on its 13.5s drop @ci-smoke",async({page})=>{
  await page.addInitScript(()=>{
    const state=(element:HTMLMediaElement)=>
      element as HTMLMediaElement&{__playhead?:number;__paused?:boolean};
    Object.defineProperty(HTMLMediaElement.prototype,"paused",{
      configurable:true,get(){return state(this).__paused??true;},
    });
    Object.defineProperty(HTMLMediaElement.prototype,"currentTime",{
      configurable:true,get(){return state(this).__playhead??0;},
      set(value:number){state(this).__playhead=value;},
    });
    HTMLMediaElement.prototype.play=function(){
      state(this).__paused=false;return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause=function(){
      state(this).__paused=true;
    };
  });
  await page.goto("./");
  // The HUD exists before the async campaign bootstrap populates the balance.
  await expect(page.locator("#merchant-gold")).toContainText("Merchant gold:");
  const gold=await page.locator("#merchant-gold").textContent();
  await page.keyboard.press("v");
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  const before=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  expect(before.bossPhase).toBeUndefined();
  // The score controls the transition, not elapsed combat ticks.
  await page.locator("#music-boss-audio").evaluate((audio:HTMLAudioElement)=>{
    audio.currentTime=13.50;
  });
  await expect(page.locator("#arena-cinematic")).toBeHidden({timeout:4000});
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","false");
  await expect(page.locator("#arena-boss-health")).toContainText("280/280");
  await page.keyboard.press("Escape");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
});
