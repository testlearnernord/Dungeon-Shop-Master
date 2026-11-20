import {expect,test} from "@playwright/test";

test("Board LIVE watch observes the real world while physical shop traffic continues @ci-smoke",async({page})=>{
  test.setTimeout(95000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const heroId=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const store=new GameStore(createGameState(7351));
    const hero=store.state.adventurers.find(h=>h.status==="exploring"&&h.floor===1);
    if(!hero)throw new Error("Missing spatial explorer.");
    store.enableLiveDungeon();
    store.advanceWorldTime(600);
    await new CampaignStorage().saveGame(store.state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-roster").click();
  const card=page.locator("#roster-detail-list [data-hero-id='"+heroId+"']");
  await expect(card).toBeVisible();
  await expect(card).toContainText("HP ?");
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  await expect(page.locator("body")).toHaveClass(/dungeon-active/);
  await expect(page.locator("#dungeon-mode-description")).toContainText("LIVE");
  await expect(page.locator("#dungeon-playback-controls")).toBeHidden();
  await expect(page.locator("#dungeon-minimap-heading")).toContainText("Personal Fog of War");
  const tick=async()=>page.evaluate(()=>{
    const hooks=window as Window & {__shopTestTraffic?:()=>{tick:number}};
    return hooks.__shopTestTraffic?.().tick??-1;
  });
  const before=await tick();
  await expect.poll(tick,{timeout:12000}).toBeGreaterThan(before+10);
  await page.locator("#close-dungeon").click();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-detail-list [data-hero-id='"+heroId+"']"))
    .toContainText("HP ?");
  expect(errors).toEqual([]);
});

test("Watch LIVE without a committed location keeps the Board open with clear feedback @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-roster").click();
  const card=page.locator("#roster-detail-list details[data-hero-id]:has(.roster-watch-live)").first();
  await card.locator("summary").click();
  await card.locator(".roster-watch-live").click();
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/dungeon-active/);
  await expect(page.locator(".roster-watch-unavailable")).toContainText(
    "no current dungeon position or fight checkpoint");
  await expect(page.locator(".roster-watch-unavailable")).toHaveAttribute("role","status");
  await page.locator("#close-roster").click();
  await expect(page.locator("#roster-dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
