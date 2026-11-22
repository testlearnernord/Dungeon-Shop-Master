import {expect,test} from "@playwright/test";

test("FPS customer inspection works by I and safe Alt-click without shop actions @ci-smoke",async({page})=>{
  test.setTimeout(75000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const visitors=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .inspectNpcVisuals().visitors.map(n=>n.id));
  await expect.poll(async()=>(await visitors()).length).toBeGreaterThan(0);
  const [id]=await visitors();
  const aim=()=>page.evaluate(async(heroId:string)=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtHeroInspectionVisitor(heroId),id);
  await aim();
  await page.waitForTimeout(180); // allow Babylon's view matrix to repaint
  await page.keyboard.press("i");
  const expanded=page.locator("#world-hero-card .hero-card--expanded");
  await expect(expanded).toBeVisible();
  await expect(expanded).toHaveAttribute("data-hero-id",id);
  await expect(page.locator("#world-hero-card-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#world-hero-card")).toBeHidden();

  await aim();
  await page.waitForTimeout(150);
  const canvas=page.locator("#renderCanvas");
  const box=await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({position:{x:box!.width/2,y:box!.height/2},
    modifiers:["Alt"]});
  await expect(expanded).toBeVisible();
  await expect(expanded).toHaveAttribute("data-hero-id",id);
  // Capturing pointerDOWN must prevent the shelf/customer motor from
  // requesting pointer lock (a later click listener could not do this).
  expect(await page.evaluate(()=>
    document.pointerLockElement===document.querySelector("#renderCanvas")))
    .toBe(false);
  await page.locator("#world-hero-card-close").click();
  await expect(page.locator("#world-hero-card")).toBeHidden();
  expect(errors).toEqual([]);
});

test("global Hero Card stays on screen and restores keyboard focus at phone and desktop widths @ci-smoke",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const trigger=page.locator("#open-roster");
  for(const width of [390,760,1440]){
    await page.setViewportSize({width,height:width===390?760:900});
    await trigger.focus();
    const opened=await page.evaluate(async()=>
      (await import("/Dungeon-Shop-Master/src/worldHeroCards.ts"))
        .inspectHeroId("adventurer-1"));
    expect(opened).toBe(true);
    const panel=page.locator("#world-hero-card");
    await expect(panel).toBeVisible();
    await expect(page.locator("#world-hero-card-close")).toBeFocused();
    const geometry=await panel.evaluate(element=>{
      const r=element.getBoundingClientRect();
      const close=element.querySelector("#world-hero-card-close")!
        .getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
        closeRight:close.right,closeBottom:close.bottom,
        width:innerWidth,height:innerHeight};
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width+1);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height+1);
    expect(geometry.closeRight).toBeLessThanOrEqual(geometry.width+1);
    expect(geometry.closeBottom).toBeLessThanOrEqual(geometry.height+1);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});
