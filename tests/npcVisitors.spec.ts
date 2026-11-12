import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";
import { advanceDay, createGameState } from "../src/game/gameState";

test("3D visitors follow confirmed GameState IDs, walk, persist, leave and respect the Level 4 player barrier", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect = () => page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).inspectNpcVisuals();
  });
  const expected = (state: ReturnType<typeof createGameState>) => state.adventurers
    .filter((hero) => hero.status === "at-shop")
    .map(({ id, name, role }) => ({ id, name, role }))
    .sort((a, b) => a.id.localeCompare(b.id));
  let state = createGameState();
  const expectedFirstDay = expected(state);
  const first = await inspect();
  expect(first.visitors.map(({ id, name, role }) => ({ id, name, role })).sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual(expectedFirstDay);
  expect(first.visitors).toHaveLength(3);
  expect(new Set(first.visitors.map(({ id }) => id)).size).toBe(3);
  expect(first.visitors.every(({ hasLabel, unpickable }) => hasLabel && unpickable)).toBe(true);
  expect(first.visitors.every(({ z, wallClear, feetY }) => z > 12.7 && wallClear && Math.abs(feetY) < 0.08)).toBe(true);
  expect(first.playerBarrierSolid).toBe(true);
  expect(first.npcMeshes.length).toBeGreaterThan(0);

  // Real animation frames, not a fixed virtual-clock jump: headless WebGL
  // may need more than one clock cycle before its first rendered frame.
  await page.clock.resume();
  await expect.poll(async()=>(await inspect()).frame,{timeout:15000})
    .toBeGreaterThan(first.frame+5);
  await expect.poll(async()=>(await inspect()).visitors.some(v=>v.z<11.5),
    {timeout:15000}).toBe(true);
  const moving=await inspect();
  expect(moving.visitors.map(({ id, uniqueId }) => ({ id, uniqueId })))
    .toEqual(first.visitors.map(({ id, uniqueId }) => ({ id, uniqueId })));
  expect(moving.gateY).toBeGreaterThan(2);
  expect(moving.visitors.every(({ wallClear }) => wallClear)).toBe(true);
  expect(moving.visitors.filter(({ z }) => z < 12.01).every(() => moving.gateY >= 3.4)).toBe(true);
  let persistentTransitions = 0;
  let departures = 0;
  for (let day = 2; day <= 12; day += 1) {
    const before = await inspect();
    const previousState = state;
    await advanceTestDay(page);
    state = advanceDay(state).state;
    await expect(page.locator("#day")).toHaveText(`Day ${day}`);
    const after = await inspect();
    expect(after.visitors.every(({ wallClear }) => wallClear)).toBe(true);
    expect(after.visitors.filter(({ status }) => status === "at-shop").map(({ id }) => id).sort())
      .toEqual(expected(state).map(({ id }) => id).sort());
    // Economic survival changes who stays/returns; derive identity assertions
    // from the authoritative states instead of assuming a particular hero/day.
    for (const prior of before.visitors) {
      const current = after.visitors.find(({ id }) => id === prior.id);
      const wasShopping = previousState.adventurers.some((hero) => hero.id === prior.id && hero.status === "at-shop");
      const shopping = state.adventurers.some((hero) => hero.id === prior.id && hero.status === "at-shop");
      if (wasShopping && shopping) {
        expect(current).toBeDefined();
      }
      if (wasShopping && !shopping) {
        departures += 1;
        if (state.adventurers.find((hero) => hero.id === prior.id)?.status === "dead") {
          expect(current).toBeUndefined();
          expect(after.npcMeshes.some((name) => name.startsWith(`npc-${prior.id}-`))).toBe(false);
        } else if (current) {
          expect(current.phase).toBe("leaving");
        }
      }
      if (current && prior.phase === "leaving" && current.uniqueId !== prior.uniqueId) {
        // A returner may finish exiting between snapshots, then enter anew.
        expect(wasShopping).toBe(false);
        expect(shopping).toBe(true);
      } else if (current) {
        persistentTransitions += 1;
        expect(current.uniqueId).toBe(prior.uniqueId);
        const elapsed = (after.time - before.time) / 1000;
        expect(Math.hypot(current.x - prior.x, current.z - prior.z)).toBeLessThan(2.1 * elapsed + 0.75);
      }
    }
    await page.waitForTimeout(100);
    expect((await inspect()).visitors.every(({ wallClear }) => wallClear)).toBe(true);
  }
  expect(persistentTransitions).toBeGreaterThan(0);
  expect(departures).toBeGreaterThan(0);

  await page.locator("#renderCanvas").click();
  await page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    (await import(modulePath)).inspectPlayer({ x: -4, y: 1.7, z: 10.5 });
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(5000);
  await page.keyboard.up("w");
  const player = await page.evaluate(async () => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(modulePath)).inspectPlayer();
  });
  expect(player.z).toBeLessThan(11.5);
  expect((await inspect()).playerBarrierSolid).toBe(true);

  const expectedVisualIds = expected(state).map(({ id }) => id).sort();
  await expect.poll(async () => (await inspect()).visitors.map(({ id }) => id).sort(), { timeout: 15_000 })
    .toEqual(expectedVisualIds);
  await expect.poll(async () => [...new Set((await inspect()).npcMeshes
    .map((name) => name.match(/^npc-(adventurer-\d+)-/)?.[1])
    .filter((id): id is string => id !== undefined))].sort(), { timeout: 15_000 })
    .toEqual(expectedVisualIds);
  expect(errors).toEqual([]);
});

test("a reversing day-tick departure resumes shopping inside rather than walking back to the gate",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  // Only stage visual positions, never inventory or GameState. These are the
  // actual indoor positions observed on day 3 of the entrance-jam repro.
  await page.evaluate(async()=>{
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).stageReturningNpcVisualsInsideShop();
  });
  await advanceTestDay(page);
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 3");
  const view=async()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals().visitors);
  const state=await view();
  const returning=state.filter(v=>["adventurer-1","adventurer-2"].includes(v.id)&&
    v.status==="at-shop");
  expect(returning.length).toBeGreaterThan(0);
  for(const npc of returning){
    expect(npc.z).toBeLessThan(4.5);
    if(npc.phase==="entering")expect(npc.shoppingPhase).toBe("resuming-in-shop");
  }
  await expect.poll(async()=> (await view()).filter(v=>
    returning.some(n=>n.id===v.id)).every(v=>v.phase!=="entering"),{timeout:8000}).toBe(true);
  expect((await view()).filter(v=>returning.some(n=>n.id===v.id))
    .every(v=>v.z<5.4)).toBe(true);
  expect(errors).toEqual([]);
});
