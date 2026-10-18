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
  expect(first.playerBarrierSolid).toBe(true);

  await page.waitForTimeout(1000);
  const moving = await inspect();
  expect(moving.frame).toBeGreaterThan(first.frame + 5);
  expect(moving.visitors.some((visitor) => visitor.z < 11.5)).toBe(true);
  expect(moving.gateY).toBeGreaterThan(2);

  let persistentId = "";
  let persistentUniqueId = 0;
  let persistentPosition = { x: 0, z: 0 };
  for (let day = 2; day <= 6; day += 1) {
    const before = await inspect();
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
    expect(after.visitors.filter(({ status }) => status === "at-shop").map(({ id }) => id).sort())
      .toEqual(expected(state).map(({ id }) => id).sort());
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

  await expect.poll(async () => (await inspect()).visitors.map(({ id }) => id).sort())
    .toEqual(expected(state).map(({ id }) => id).sort());
  expect(errors).toEqual([]);
});
