import { expect, test, type Page } from "@playwright/test";

async function player(page: Page, reset?: { x: number; y: number; z: number }) {
  return page.evaluate(async (position) => {
    const modulePath = "/Dungeon-Shop-Master/tests/scene.ts";
    const { inspectPlayer } = await import(modulePath);
    return inspectPlayer(position);
  }, reset);
}

async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(duration);
  } finally {
    await page.keyboard.up(key);
  }
}

test("WASD, gravity, collisions and rendering survive sustained input and reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.text().includes("needs to be imported")) {
      // Browsers may request an optional favicon that the prototype does not provide.
      if (!message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
    }
  });

  await page.goto("./");
  for (let reload = 0; reload <= 3; reload += 1) {
    if (reload > 0) await page.reload();
    await expect(page.locator("#status")).toHaveText("Click to enter the shop");
    await expect.poll(async () => (await player(page)).frame).toBeGreaterThan(5);
    await page.locator("#renderCanvas").click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("renderCanvas");

    for (const [key, axis, direction] of [
      ["w", "z", 1], ["s", "z", -1], ["a", "x", -1], ["d", "x", 1],
    ] as const) {
      const start = await player(page, { x: 0, y: 1.7, z: -4.6 });
      await hold(page, key, 1000);
      const end = await player(page);
      expect((end[axis] - start[axis]) * direction, `${key} after reload ${reload}`).toBeGreaterThan(0.1);
      expect(end.frame).toBeGreaterThan(start.frame + 5);
      expect(end.y).toBeGreaterThan(1.6);
      expect(end.y).toBeLessThan(1.8);
      expect(errors).toEqual([]);
    }

    const beforeLook = await player(page);
    await page.mouse.move(400, 300);
    await page.mouse.move(460, 300);
    await expect.poll(async () => Math.abs((await player(page)).yaw - beforeLook.yaw)).toBeGreaterThan(0.001);
    await page.evaluate(() => document.exitPointerLock());
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  }

  await page.locator("#renderCanvas").click();
  await player(page, { x: 0, y: 2.5, z: -4.6 });
  // Keep keys held for 32 seconds, sampling actual scene progress every second.
  for (const key of ["w", "a", "s", "d"]) {
    await page.keyboard.down(key);
    for (let second = 0; second < 8; second += 1) {
      const start = await player(page);
      await page.waitForTimeout(1000);
      const end = await player(page);
      expect(end.frame).toBeGreaterThan(start.frame + 5);
      expect(end.y).toBeGreaterThan(1.6);
      expect(end.y).toBeLessThan(1.8);
      expect(Math.abs(end.x)).toBeLessThan(7);
      expect(end.z).toBeGreaterThan(-6.5);
      expect(end.collisions && end.gravity).toBe(true);
      expect(errors).toEqual([]);
    }
    await page.keyboard.up(key);
  }

  for (const [key, z, axis, minimum, maximum] of [
    ["s", -4.6, "z", -6.5, -6],
    ["a", -4.6, "x", -7, -6.5],
    ["d", -4.6, "x", 6.5, 7],
    ["a", 0, "x", -2.5, -2],
    ["d", 0, "x", 2, 2.5],
    ["w", -4.6, "z", 1, 1.6],
  ] as const) {
    await player(page, { x: 0, y: 1.7, z });
    await hold(page, key, 5000);
    const end = await player(page);
    expect(end[axis], `${key} collision at z=${z}`).toBeGreaterThan(minimum);
    expect(end[axis], `${key} collision at z=${z}`).toBeLessThan(maximum);
    expect(end.y).toBeGreaterThan(1.6);
    expect(end.y).toBeLessThan(1.8);
  }
  await page.keyboard.press("e");
  expect(errors).toEqual([]);
});
