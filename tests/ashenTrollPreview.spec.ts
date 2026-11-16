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
  // Check the real MP3 URL and signature from the same deployed Vite base
  // path the soundtrack uses; an SPA HTML fallback is not audio.
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
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectBossArena());
  const initial=await inspect();
  expect(initial.trollVisualId).toBe("ashen-tunnel-mauler");
  expect(initial.trollMeshCount).toBeGreaterThan(120);
  expect(initial.realTroll3d).toBeGreaterThan(100);
  expect(initial.realMaul3d).toBeGreaterThan(20);
  expect(initial.canisterCount).toBe(2);
  expect(initial.mineWalls).toBe(46);
  expect(initial.boss).toBe(true);
  expect(initial.hero).toBe(true);
  expect(initial.lava).toBe(true);

  // Pose must be produced by the real preview motor, not by a static loop.
  await expect.poll(async()=> (await inspect()).bossPhase,
    {timeout:20000,intervals:[100,200,200]}).toBe("windup");
  const start=(await inspect()).trollHammerRotation??0;
  await expect.poll(async()=>{
    const current=await inspect();
    return Math.abs((current.trollHammerRotation??0)-start);
  },{timeout:7000,intervals:[100,100,150]}).toBeGreaterThan(.16);
  await page.screenshot({path:testInfo.outputPath("ashen-mauler-training-preview.png")});
  await page.keyboard.press("Tab"); // actual spectator switch to boss focus
  await expect(page.locator("#arena-focus")).toContainText("CAVE TROLL");
  await page.screenshot({path:testInfo.outputPath("ashen-mauler-boss-closeup.png")});

  // Death is a noninstant sequence, tested on an isolated visual-only rig,
  // without artificially mutating the real campaign or replay frames.
  const death=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCaveTrollDeathPose());
  expect(death.fall).toBeGreaterThan(.95);
  expect(death.weapon).toBeGreaterThan(.85);
  expect(death.elapsed).toBeGreaterThan(1.6);

  // Restart clears all scene-owned meshes and reconstructs the same boss.
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-boss-health")).toContainText("145/145");
  const restarted=await inspect();
  expect(restarted.trollMeshCount).toBe(initial.trollMeshCount);
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-hud")).toBeHidden();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(startingGold!);
  expect(errors).toEqual([]);
});
