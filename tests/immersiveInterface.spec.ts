import {expect,test} from "@playwright/test";

test("default shop HUD is transparent and the full shop remains in view",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#shop-status-content")).toBeHidden();
  await expect(page.locator("#adventurer-details")).toBeHidden();
  await expect(page.locator("#merchant-gold")).toBeVisible();
  await expect(page.locator("#open-wholesale")).toBeVisible();
  const dock=page.locator("#inventory");
  await expect(dock.locator(".inventory-row")).toHaveCount(6);
  const appearance=await dock.evaluate(element=>{
    const box=element.getBoundingClientRect(),css=getComputedStyle(element);
    return {width:box.width,height:box.height,bg:css.backgroundColor,
      border:css.borderTopWidth};
  });
  expect(appearance.bg).toBe("rgba(0, 0, 0, 0)");
  expect(appearance.border).toBe("0px");
  expect(appearance.width).toBeLessThan(480);
  expect(appearance.height).toBeLessThan(80);
  const icons=await page.locator("#hud .ui-icon-button svg use").evaluateAll(nodes=>
    nodes.map(node=>node.getAttribute("href")));
  expect(icons.length).toBeGreaterThanOrEqual(7);
  expect(icons.every(url=>url?.includes("assets/ui-interface-icons.svg#"))).toBe(true);
  const musicIcon=page.locator("#music-toggle svg use");
  await expect(musicIcon).toHaveAttribute("href",/ui-interface-icons\.svg#speaker$/);
});

test("campaign save failure remains visible even when shop details are closed",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#shop-status-content")).toBeHidden();
  await page.locator("#save-status").evaluate(node=>{
    node.textContent="Save error: invalid shelf coordinates. Export your campaign.";
  });
  await expect(page.locator("#save-status")).toHaveAttribute("data-error","true");
  await expect(page.locator("#save-status")).toBeVisible();
  await expect(page.locator("#shop-status-content")).toBeHidden();
  await page.locator("#save-status").evaluate(node=>{
    node.textContent="Saved Day 1.";
  });
  await expect(page.locator("#save-status")).toHaveAttribute("data-error","false");
});

for(const width of [390,800,1440]){
  test("icon dock fits inside the viewport at "+width+"px",async({page})=>{
    await page.setViewportSize({width,height:width===390?844:800});
    await page.goto("./");
    await expect(page.locator("#day")).toHaveText("Day 1");
    const dock=await page.locator("#inventory").boundingBox();
    expect(dock).not.toBeNull();
    expect(dock!.x).toBeGreaterThanOrEqual(-1);
    expect(dock!.x+dock!.width).toBeLessThanOrEqual(width+1);
    expect(dock!.height).toBeLessThan(85);
    const controls=page.locator("#hud details.controls");
    await controls.locator("summary").click();
    await expect(controls.locator(".controls-keys")).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>{
      const help=document.querySelector("#hud .controls-keys")!.getBoundingClientRect();
      const dock=document.querySelector("#inventory")!.getBoundingClientRect();
      return help.bottom<=dock.top-3;
    })).toBe(true);
  });
}

test("roster and receipts reuse the same item pictograms as the hotbar",async({page})=>{
  await page.goto("./");
  await page.locator("#open-roster").click();
  const card=page.locator("#roster-dialog .roster-card").first();
  await card.locator("summary").click();
  const icons=await card.locator(".roster-item-icon use").evaluateAll(nodes=>
    nodes.map(node=>node.getAttribute("href")));
  expect(icons).toHaveLength(5);
  expect(icons.every(s=>s?.includes("assets/ui-item-icons.svg#"))).toBe(true);
});
