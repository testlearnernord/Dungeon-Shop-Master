import {expect,test} from "@playwright/test";

test("hotbar symbols share exact geometric centers across all six slots",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const deltas=await page.locator("#inventory .inventory-row").evaluateAll(nodes=>
    nodes.map(row=>{
      const a=row.getBoundingClientRect();
      const b=row.querySelector(".item-pictogram")!.getBoundingClientRect();
      return {dx:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),
        dy:Math.abs((a.top+a.height/2)-(b.top+b.height/2))};
    }));
  expect(deltas).toHaveLength(6);
  expect(deltas.every(d=>d.dx<1&&d.dy<1)).toBe(true);
});

test("music controls start collapsed at bottom right and never overlap the top banner",async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await page.goto("./");
  await expect(page.locator("#music-content")).toBeHidden();
  const panel=await page.locator("#music-panel").boundingBox();
  const banner=await page.locator("#sales-banner").boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.x).toBeGreaterThan(850);
  expect(panel!.y).toBeGreaterThan(600);
  if(banner)expect(panel!.y).toBeGreaterThan(banner.y+banner.height);
  await page.locator("#music-expand").click();
  await expect(page.locator("#music-content")).toBeVisible();
  await page.locator("#music-expand").click();
  await expect(page.locator("#music-content")).toBeHidden();
});

test("expanded management has metrics and grouped events instead of raw scrolling logs",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#toggle-shop-status").click();
  await page.locator(".shop-management-details > summary").click();
  await page.locator(".day-report > summary").click();
  await expect(page.locator("#day-report-metrics .day-metric")).toHaveCount(4);
  await expect(page.locator("#day-history .report-category").first()).toBeVisible();
  const rect=await page.locator("#shop-status-content").boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.width).toBeGreaterThan(350);
  const overflow=await page.locator("#world-events").evaluate(el=>getComputedStyle(el).overflowY);
  expect(overflow).not.toBe("scroll");
});

test("every roster portrait uses the centralized face-safe atlas crop",async({page})=>{
  await page.goto("./");
  await page.locator("#open-roster").click();
  const samples=await page.locator(".roster-portrait").evaluateAll(nodes=>
    nodes.slice(0,10).map(el=>({
      id:Number((el as HTMLElement).dataset.portraitId),
      size:(el as HTMLElement).style.backgroundSize,
      pos:(el as HTMLElement).style.backgroundPosition,
    })));
  expect(samples).toHaveLength(10);
  const expected=await page.evaluate(async(ids:number[])=>{
    const {heroPortraitBackground}=await import("/Dungeon-Shop-Master/src/game/portraitAtlas.ts");
    return ids.map(heroPortraitBackground);
  },samples.map(s=>s.id));
  for(let i=0;i<samples.length;i++){
    expect(samples[i].size).toBe(expected[i].size);
    expect(samples[i].pos).toBe(expected[i].position);
  }
  await expect(page.locator("#merchant-gold .ui-icon use")).toHaveAttribute("href",/ui-interface-icons\.svg#coin$/);
});
