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
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await expect(page.locator(".arena-bottom")).toBeHidden();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","true");
  const initial=await inspect();
  expect(initial.heroPosition?.z).toBe(-9);
  // A real preview never starts to simulate during the introductory camera.
  await page.waitForTimeout(450);
  expect((await inspect()).heroPosition).toEqual(initial.heroPosition);
  expect((await inspect()).bossPosition).toEqual(initial.bossPosition);
  expect((await inspect()).bossPhase).toBeUndefined();
  expect(initial.trollVisualId).toBe("ashen-tunnel-mauler");
  expect(initial.trollMeshCount).toBeGreaterThan(120);
  expect(initial.realTroll3d).toBeGreaterThan(100);
  expect(initial.realMaul3d).toBeGreaterThan(20);
  expect(initial.canisterCount).toBe(2);
  expect(initial.mineWalls).toBe(46);
  expect(initial.boss).toBe(true);
  expect(initial.hero).toBe(true);
  expect(initial.lava).toBe(true);

  // Skip correctly seeks the score to its 13.5-second attack peak,
  // then starts the unchanged preview motor on its original first frame.
  await page.keyboard.press("Space");
  await expect(page.locator("#arena-cinematic")).toBeHidden();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","false");
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
  const locomotion=await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectCaveTrollMotion());
  expect(locomotion.gaitMeters).toBeGreaterThan(5);
  expect(locomotion.footMinimum).toBeCloseTo(.30,1);
  expect(locomotion.footMaximum-locomotion.footMinimum).toBeGreaterThan(.20);
  expect(locomotion.windup).toBeLessThan(-.8);
  expect(locomotion.strike-locomotion.windup).toBeGreaterThan(.85);
  expect(locomotion.liftAtWindup).toBeGreaterThan(.5);

  // Restart clears all scene-owned meshes and reconstructs the same boss.
  await page.locator("#restart-arena").click();
  await expect(page.locator("#arena-boss-health")).toContainText("145/145");
  const restarted=await inspect();
  expect(restarted.trollMeshCount).toBe(initial.trollMeshCount);
  await expect(page.locator("#arena-cinematic")).toBeVisible();
  await expect(page.locator("#arena-hud")).toHaveAttribute("data-intro","true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#arena-hud")).toBeHidden();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(startingGold!);
  expect(errors).toEqual([]);
});


test("a playing Desperate Measures playhead starts the duel on its 13.5s drop",async({page})=>{
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
  await expect(page.locator("#arena-boss-health")).toContainText("145/145");
  await page.keyboard.press("Escape");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
});
