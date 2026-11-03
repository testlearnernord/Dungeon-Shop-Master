import { expect, test } from "@playwright/test";

test("music uses the correct deployed assets and tracks shop / boss scenes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-track")).toHaveText("The Last Warm Light");
  await expect(page.locator("#music-status")).toContainText("first click");
  const sources = await page.locator("#music-panel audio").evaluateAll(nodes =>
    nodes.map(node => (node as HTMLAudioElement).src));
  expect(sources).toHaveLength(2);
  expect(sources[0]).toMatch(/\/Dungeon-Shop-Master\/audio\/the-last-warm-light\.mp3$/);
  expect(sources[1]).toMatch(/\/Dungeon-Shop-Master\/audio\/trial-by-iron\.mp3$/);
  const gold = await page.locator("#merchant-gold").textContent();
  await page.locator("#open-arena").click();
  await expect(page.locator("#music-track")).toHaveText("Trial by Iron");
  await page.locator("#close-arena").click();
  await expect(page.locator("#music-track")).toHaveText("The Last Warm Light");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText(gold!);
  expect(errors).toEqual([]);
});

test("mute and volume persist across reloads independently of campaign state", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
  await page.locator("#music-toggle").click();
  await expect(page.locator("#music-toggle")).toHaveText("Unmute");
  await expect(page.locator("#music-status")).toHaveText("Music off");
  await page.locator("#music-volume").evaluate((slider: HTMLInputElement) => {
    slider.value = "17";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#music-toggle")).toHaveText("Unmute");
  await expect(page.locator("#music-volume")).toHaveValue("17");
  await page.locator("#music-toggle").click();
  await expect(page.locator("#music-toggle")).toHaveText("Mute");
});

test("music controls remain keyboard-accessible while watching Level 6", async ({ page }) => {
  await page.goto("./");
  await page.locator("#open-arena").click();

  await page.keyboard.press("m");
  await expect(page.locator("#music-toggle")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#music-toggle")).toHaveText("Unmute");

  await page.keyboard.press("Tab");
  await expect(page.locator("#music-volume")).toBeFocused();
  const volume = Number(await page.locator("#music-volume").inputValue());
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#music-volume")).toHaveValue(String(Math.min(100, volume + 1)));
});

test("boss music restarts when re-entering before its fade-out finishes", async ({ page }) => {
  await page.addInitScript(() => {
    const state = (element: HTMLMediaElement) => {
      const audio = element as HTMLMediaElement & { __paused?: boolean; __time?: number };
      return audio;
    };
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() { return state(this).__paused ?? true; },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() { return state(this).__time ?? 0; },
      set(value: number) { state(this).__time = value; },
    });
    HTMLMediaElement.prototype.play = function () {
      state(this).__paused = false;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      state(this).__paused = true;
    };
  });
  await page.goto("./");
  await page.locator("#open-arena").click();
  await page.waitForTimeout(1200);
  await page.locator("#music-boss-audio").evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = 42;
  });
  await page.locator("#close-arena").click();
  await page.locator("#open-arena").click();

  await expect.poll(() => page.locator("#music-boss-audio").evaluate((audio: HTMLAudioElement) =>
    audio.currentTime)).toBe(0);
});

test("failed incoming music stops the outgoing track", async ({ page }) => {
  await page.addInitScript(() => {
    const state = (element: HTMLMediaElement) => {
      const audio = element as HTMLMediaElement & { __paused?: boolean };
      return audio;
    };
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() { return state(this).__paused ?? true; },
    });
    HTMLMediaElement.prototype.play = function () {
      if (this.id === "music-boss-audio") return Promise.reject(new Error("Playback unavailable"));
      state(this).__paused = false;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      state(this).__paused = true;
    };
  });
  await page.goto("./");
  await page.locator("#open-arena").click();

  await expect(page.locator("#music-status")).toHaveText("Click to enable audio");
  await expect.poll(() => page.locator("#music-shop-audio").evaluate((audio: HTMLAudioElement) =>
    audio.paused)).toBe(true);
});
