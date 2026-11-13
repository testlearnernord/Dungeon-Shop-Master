import {expect,test} from "@playwright/test";
test("all six hotbar symbols are centered independently of their counters",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const points=await page.locator("#inventory .inventory-row").evaluateAll(rows=>
    rows.map(row=>{
      const icon=row.querySelector(".item-pictogram")!;
      const box=row.getBoundingClientRect(),art=icon.getBoundingClientRect();
      return {dx:(art.left+art.width/2)-(box.left+box.width/2),
        dy:(art.top+art.height/2)-(box.top+box.height/2)};
    }));
  expect(points).toHaveLength(6);
  for(const point of points){
    expect(Math.abs(point.dx)).toBeLessThan(1.2);
    expect(Math.abs(point.dy)).toBeLessThan(1.2);
  }
});
test("report drawer has typed filters and category metrics, not raw nested logs",async({page})=>{
  await page.goto("./");
  await page.locator("#toggle-shop-status").click();
  await expect(page.locator("#world-events")).toBeVisible();
  const report=page.locator(".day-report");
  await report.locator("summary").click();
  await expect(report).toHaveAttribute("open","");
  await expect(page.locator("#day-history-overview .report-count")).toHaveCount(4);
  const shop=page.locator('[data-report-filter="shop"]');
  await shop.click();
  await expect(shop).toHaveAttribute("aria-pressed","true");
  const categories=await page.locator("#day-history .report-event").evaluateAll(rows=>
    rows.map(row=>row.getAttribute("data-category")));
  expect(categories.every(name=>name==="shop")).toBe(true);
  await page.locator('[data-report-filter="all"]').click();
  await expect(page.locator("#day-history .report-event").first()).toBeVisible();
});
test("one coin asset is shared by merchant, roster and market",async({page})=>{
  await page.goto("./");
  const coin=page.locator("#merchant-gold img.ui-gold-icon");
  await expect(coin).toHaveAttribute("src",/assets\/ui-gold\.svg$/);
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-dialog .roster-overview img.ui-gold-icon").first())
    .toHaveAttribute("src",/assets\/ui-gold\.svg$/);
  await page.locator("#close-roster").click();
  await page.locator("#open-wholesale").click();
  await expect(page.locator("#wholesale-gold img.ui-gold-icon"))
    .toHaveAttribute("src",/assets\/ui-gold\.svg$/);
});
test("music controls never cover the top-center shop banner",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("./");
  const positions=await page.evaluate(()=>{
    const music=document.querySelector("#music-panel")!.getBoundingClientRect();
    const banner=document.querySelector("#sales-banner")!.getBoundingClientRect();
    return {music:{left:music.left,right:music.right,top:music.top,bottom:music.bottom},
      banner:{left:banner.left,right:banner.right,top:banner.top,bottom:banner.bottom}};
  });
  expect(positions.music.top).toBeGreaterThan(positions.banner.bottom);
});
test("roster uses the same safe portrait crop for every hero",async({page})=>{
  await page.goto("./");
  await page.locator("#open-roster").click();
  const portrait=page.locator("#roster-dialog .roster-portrait").first();
  await expect(portrait).toHaveAttribute("data-portrait-id","0");
  const data=await portrait.evaluate(node=>{
    const style=getComputedStyle(node);
    return {size:style.backgroundSize,repeat:style.backgroundRepeat};
  });
  expect(Number.parseFloat(data.size)).toBeGreaterThan(500);
  expect(data.repeat).toBe("no-repeat");
});
