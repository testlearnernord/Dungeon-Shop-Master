import { expect, test } from "@playwright/test";
import { advanceDay, createGameState, setLevel6Permit } from "../src/game/gameState";

test("Level 6 visitors use the right gate while the cursed player stays behind its barrier", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.locator("#toggle-adventurer-details").click();
  await expect(page.locator("#day")).toHaveText("Day 1");

  const inspect = () => page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());

  const state = createGameState();
  const choices = state.adventurers.filter((hero) => hero.status === "at-shop");
  const survivors = choices.filter((hero) => {
    let projected = setLevel6Permit(state, hero.id, true);
    projected = advanceDay(advanceDay(projected).state).state;
    return projected.adventurers.find((h) => h.id === hero.id)?.status === "traveling";
  });
  // The first boss is deliberately deadly to unarmed visitors; no test may
  // assume an unequipped starting hero always lives.
  const candidate = survivors[0] ?? choices[0];
  const id = candidate.id;
  const expectReturn = survivors.length > 0;

  const first = await inspect();
  expect(first.visitors).toHaveLength(3);
  expect(first.visitors.every((hero) => hero.gateSide === "level4")).toBe(true);
  expect(first.playerBarrierSolid).toBe(true);
  expect(first.playerBarrier6Solid).toBe(true);
  expect(first.playerBarrier6Hidden).toBe(true);

  await page.locator(`#adventurer-roster button.level6-permit[data-adventurer-id="${id}"]`).click();
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");

  const departing = await inspect();
  const outgoing = departing.visitors.find((hero) => hero.id === id);
  expect(outgoing).toBeDefined();
  expect(outgoing!.phase).toBe("leaving");
  expect(outgoing!.status).toBe("expedition");
  expect(outgoing!.gateSide).toBe("level6");
  await expect.poll(async () => (await inspect()).gate6Y, { timeout: 10_000 }).toBeGreaterThan(3.4);
  expect((await inspect()).playerBarrier6Solid).toBe(true);

  // The Level 6 route does not make the player physically able to escape.
  await page.locator("#renderCanvas").click();
  await page.evaluate(async () => {
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer({ x: 4, y: 1.7, z: 10.5 });
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(2200);
  await page.keyboard.up("w");
  const player = await page.evaluate(async () =>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectPlayer());
  expect(player.z).toBeLessThan(11.5);

  await page.keyboard.press("n");
  await page.keyboard.press("y");
  await expect(page.locator("#day")).toHaveText("Day 3");
  await page.keyboard.press("n");
  await page.keyboard.press("y");
  await expect(page.locator("#day")).toHaveText("Day 4");
  const arriving = await inspect();
  const returner = arriving.visitors.find((hero) => hero.id === id);
  if (expectReturn) {
    expect(returner).toBeDefined();
    expect(returner!.phase).toBe("entering");
    expect(returner!.gateSide).toBe("level6");
    expect(returner!.status).toBe("at-shop");
    expect(returner!.unpickable).toBe(true);
  } else {
    // Boss defeats poorly equipped adventurers instead of magically returning
    // them to the shop. The physical player barrier stays solid regardless.
    expect(returner).toBeUndefined();
  }
  expect(arriving.playerBarrier6Solid).toBe(true);
  expect(errors).toEqual([]);
});
