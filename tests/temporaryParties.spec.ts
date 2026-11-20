import {expect,test} from "@playwright/test";

test("Temporary Party appears in day feed, both roster and saved dungeon footage",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto("./");
  await page.evaluate(async()=>{
    const {createGameState,advanceDay}=await import(
      "/Dungeon-Shop-Master/src/game/gameState.ts");
    const {generateExpeditionLayout}=await import(
      "/Dungeon-Shop-Master/src/game/dungeonLayout.ts");
    const {CampaignStorage}=await import(
      "/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const base=createGameState(7351);
    const map=generateExpeditionLayout(base.seed,1);
    const visited=map.tiles.flatMap((t,i)=>t!=="wall"?[i]:[]);
    const pair=base.adventurers.slice(0,2).map(hero=>({
      ...hero,status:"exploring" as const,floor:1 as const,
      health:hero.stats.maxHealth,shopStayDays:0,
      equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
      traits:{...hero.traits,negative:"stubborn"},
    }));
    const world={resolvedFeatureIds:map.features.map(f=>f.id),
      heroes:pair.map(hero=>({
        heroId:hero.id,...map.entrance,visited,
      }))};
    const prepared={...base,
      adventurers:base.adventurers.map(hero=>
        pair.find(candidate=>candidate.id===hero.id)??{
          ...hero,status:"at-shop" as const,floor:5 as const,shopStayDays:0,
        }),
      earlyDungeonWorlds:[{floor:1 as const,world}],
    };
    const confirmed=advanceDay(prepared).state;
    await new CampaignStorage().saveGame(confirmed);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#world-events")).toContainText("joined a Temporary Party");
  await page.locator("#open-roster").click();
  await expect(page.locator("#roster-totals")).toContainText("1 Temporary Parties");
  const members=page.locator("#roster-detail-list details[data-temporary-party='1']");
  await expect(members).toHaveCount(2);
  await expect(members.first().locator("summary")).toContainText("Temporary Party #1 (2)");
  await members.first().locator("summary").click();
  await expect(members.first().locator(".roster-party-details"))
    .toContainText("Temporary Party #1");
  await expect(members.first().locator(".roster-party-details li")).toHaveCount(1);
  await page.locator("#close-roster").click();

  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-open-archive").click();
  const options=page.locator("#dungeon-replay-select option");
  await expect(options.filter({hasText:"Temporary Party (2)"})).toHaveCount(2);
  await expect(page.locator("#dungeon-temporary-party")).toBeVisible();
  await expect(page.locator("#dungeon-temporary-party-heading"))
    .toContainText("Temporary Party · 2 adventurers · Day 2");
  await expect(page.locator("#dungeon-temporary-party-members li")).toHaveCount(2);
  await expect(page.locator("#dungeon-temporary-party-members li[data-focused='true']"))
    .toHaveCount(1);
  const inspect=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonPlayback());
  const running=await inspect();
  expect(running.temporaryPartyCompanions).toHaveLength(1);
  expect(running.temporaryPartyCompanions[0]).toMatchObject({
    visible:true,weapon:"Iron Sword",armor:"Leather Vest",
    temporaryParty:true,
  });
  expect(running.temporaryPartyRings).toBe(2);
  // One model was historically recorded per member, not a sphere
  // masquerading as another character.
  await page.locator("#dungeon-timeline").evaluate(node=>{
    const slider=node as HTMLInputElement;
    slider.value="500";slider.dispatchEvent(new Event("input",{bubbles:true}));
  });
  const later=await inspect();
  expect(later.temporaryPartyCompanions).toHaveLength(1);
  expect(later.temporaryPartyCompanions[0].visible).toBe(true);
  await page.locator("#dungeon-replay-select").selectOption("preview");
  expect((await inspect()).temporaryPartyCompanions).toHaveLength(0);
  await expect(page.locator("#dungeon-temporary-party")).toBeHidden();
  await page.locator("#close-dungeon").click();
  await page.reload();
  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-open-archive").click();
  await expect(page.locator("#dungeon-temporary-party")).toBeVisible();
  expect(errors).toEqual([]);
});

test("empty preview has no invented Temporary Party or join events",async({page})=>{
  await page.goto("./");
  await expect(page.locator("#world-events")).not.toContainText("Temporary Party");
  await page.locator("#open-dungeon").click();
  await page.locator("#dungeon-open-archive").click();
  await expect(page.locator("#dungeon-temporary-party")).toBeHidden();
  const empty=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectDungeonPlayback());
  expect(empty.temporaryPartyCompanions).toHaveLength(0);
  expect(empty.temporaryPartyRings).toBe(0);
});
