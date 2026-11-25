import {expect,test} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";

test("Capture actual adventurer board and roster on the PR candidate",async({page})=>{
  await mkdir("board-screenshots",{recursive:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.goto("./?e2e-pause-world");
  // Vite can re-optimize Babylon imports and reload the first page.
  // Retry the real scene probe through that reload, not the static Day 1 label.
  await expect.poll(async()=>{
    try{return await page.evaluate(async()=>{
      const scene=await import("/Dungeon-Shop-Master/tests/scene.ts");
      return scene.shopSceneReady();
    });}catch{return false;}
  },{timeout:60000}).toBe(true);
  await expect.poll(async()=>{
    try{return await page.evaluate(async()=>{
      const scene=await import("/Dungeon-Shop-Master/tests/scene.ts");
      const p=scene.frameRosterBoardForScreenshot();
      return p?.hit??null;
    });}catch{return null;}
  },{timeout:30000}).toBe("adventurer-roster-board");
  const probe=async()=>page.evaluate(async()=>{
    return (await import("/Dungeon-Shop-Master/tests/scene.ts")).rosterScreenshotProbe();
  });
  const first=(await probe())!;
  await expect.poll(async()=>{
    try{const p=await probe();return !!p&&p.hit==="adventurer-roster-board"&&p.frame>first.frame;}
    catch{return false;}
  },{timeout:20000}).toBe(true);
  const before=(await probe())!;
  expect(before.hit).toBe("adventurer-roster-board");
  // The texture is the genuine DynamicTexture painted by the game, not a mockup.
  await writeFile("board-screenshots/00-board-texture.png",Buffer.from(before.texture.split(",")[1],"base64"));
  await page.screenshot({path:"board-screenshots/01-wall-board.png"});
  expect((await probe())?.hit).toBe("adventurer-roster-board");
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-dialog")).toBeVisible({timeout:15000});
  await expect(page.locator("#roster-detail-list .roster-card")).toHaveCount(10);
  await page.screenshot({path:"board-screenshots/02-roster.png"});
  await page.locator("#roster-detail-list .roster-card").first().locator("summary").click();
  await expect(page.locator("#roster-detail-list .roster-card[open]")).toBeVisible();
  await page.screenshot({path:"board-screenshots/03-expanded-hero.png"});
});
