import {expect,test} from "@playwright/test";

test("wholesale shows live bag and shelf counts, matching icons and filtered products",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-wholesale").click();
  await expect(page.locator("#wholesale-gold")).toHaveText("20g");
  await expect(page.locator("#wholesale-bag-fill")).toHaveText("14 / 24 bag slots");
  const cards=page.locator("#wholesale-catalog .catalog-row");
  await expect(cards).toHaveCount(6);
  await expect(page.locator("#wholesale-count")).toHaveText("6 / 6 items");
  const symbolIds=await cards.locator(".catalog-item-icon use").evaluateAll(nodes=>
    nodes.map(node=>node.getAttribute("href")));
  expect(symbolIds).toHaveLength(6);
  expect(symbolIds.every(uri=>uri?.includes("assets/ui-item-icons.svg#"))).toBe(true);
  await page.locator("#wholesale-category").selectOption("equipment");
  await expect(cards.filter({visible:true})).toHaveCount(2);
  await expect(page.locator("#wholesale-count")).toHaveText("2 / 6 items");
  await page.locator("#wholesale-category").selectOption("all");
  await page.locator("#wholesale-search").fill("waybread");
  await expect(cards.filter({visible:true})).toHaveCount(1);
  const bread=cards.filter({hasText:"Waybread"});
  await expect(bread.locator(".catalog-bag-amount")).toHaveText("Bag: 2");
  await expect(bread.locator(".catalog-shelf-amount")).toHaveText("On shelves: 3");
  await bread.getByRole("button",{name:"Buy 1 Waybread"}).click();
  await expect(bread.locator(".catalog-bag-amount")).toHaveText("Bag: 3");
  await expect(page.locator("#wholesale-gold")).toHaveText("18g");
  await expect(page.locator("#wholesale-bag-fill")).toHaveText("15 / 24 bag slots");
  expect(errors).toEqual([]);
});

for(const viewport of [{width:800,height:600},{width:390,height:844}]){
  test("expanded keyboard controls clear the stocking bar at "+viewport.width+"px",async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto("./");
    const legend=page.locator("#hud details.controls");
    await legend.locator("summary").click();
    await expect(legend).toHaveAttribute("open","");
    const keys=legend.locator(".controls-keys");
    await expect(keys).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>{
      const hotbar=document.querySelector("#inventory")!.getBoundingClientRect();
      const popup=document.querySelector("#hud .controls-keys")!.getBoundingClientRect();
      return popup.bottom<=hotbar.top-4;
    }),{timeout:5000}).toBe(true);
    const bounds=await keys.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width+1);
    await expect(page.locator("#inventory .hotbar-selected")).toContainText("READY TO STOCK");
  });
}
