import { expect, test } from "@playwright/test";
import { advanceDay, createGameState } from "../src/game/gameState";

test("3D visitors follow confirmed GameState IDs, walk, persist, leave and respect the Level 4 player barrier", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
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

  await page.waitForTimeout(2000);
  const moving = await inspect();
  expect(moving.frame).toBeGreaterThan(first.frame + 5);
  expect(moving.visitors.some((visitor) => visitor.z < 11.5)).toBe(true);
  expect(moving.gateY).toBeGreaterThan(2);
  expect(moving.visitors.every(({ wallClear }) => wallClear)).toBe(true);
  expect(moving.visitors.filter(({ z }) => z < 12.01).every(() => moving.gateY >= 3.4)).toBe(true);

  let persistentId = "";
  let persistentUniqueId = 0;
  let persistentPosition = { x: 0, z: 0 };
  let returningUniqueId = 0;
  let returningPosition = { x: 0, z: 0 };
  let returningTime = 0;
  for (let day = 2; day <= 12; day += 1) {
    const before = await inspect();
    if (day === 5) {
      const returning = before.visitors.find(({ id }) => id === "adventurer-2");
      expect(returning?.phase).toBe("leaving");
      expect(returning?.uniqueId).toBe(returningUniqueId);
    }
    if (day === 6) {
      const visitor = before.visitors.find(({ id }) => id === "adventurer-6");
      expect(visitor).toBeDefined();
      persistentId = visitor!.id;
      persistentUniqueId = visitor!.uniqueId;
      persistentPosition = { x: visitor!.x, z: visitor!.z };
    }
    await page.keyboard.press("n");
    await page.keyboard.press("y");
    state = advanceDay(state).state;
    await expect(page.locator("#day")).toHaveText(`Day ${day}`);
    const after = await inspect();
    expect(after.visitors.every(({ wallClear }) => wallClear)).toBe(true);
    expect(after.visitors.filter(({ status }) => status === "at-shop").map(({ id }) => id).sort())
      .toEqual(expected(state).map(({ id }) => id).sort());
    if (day === 5) {
      const returning = after.visitors.find(({ id }) => id === "adventurer-2");
      expect(returning?.uniqueId).toBe(returningUniqueId);
      const elapsed = (after.time - returningTime) / 1000;
      expect(Math.hypot(returning!.x - returningPosition.x, returning!.z - returningPosition.z)).toBeLessThan(2.1 * elapsed + 0.75);
    }
    if (day === 4) {
      const leaving = after.visitors.find(({ id }) => id === "adventurer-2");
      expect(leaving?.phase).toBe("leaving");
      returningUniqueId = leaving!.uniqueId;
      returningPosition = { x: leaving!.x, z: leaving!.z };
      returningTime = after.time;
      for (let sample = 0; sample < 2; sample += 1) {
        await page.waitForTimeout(100);
        expect((await inspect()).visitors.every(({ wallClear }) => wallClear)).toBe(true);
      }
    }
    if (day === 12) {
      expect(state.adventurers.find(({ id }) => id === "adventurer-3")?.status).toBe("dead");
      expect(after.visitors.some(({ id }) => id === "adventurer-3")).toBe(false);
      expect(after.npcMeshes.some((name) => name.startsWith("npc-adventurer-3-"))).toBe(false);
    }
    if (day === 6) {
      const staying = after.visitors.find(({ id }) => id === persistentId);
      expect(staying?.uniqueId).toBe(persistentUniqueId);
      expect(Math.hypot(staying!.x - persistentPosition.x, staying!.z - persistentPosition.z)).toBeLessThan(3);
    }
  }

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
