import { expect, test, type Page } from "@playwright/test";

async function campaignMenu(page: Page) {
  await page.locator(".campaign-panel").evaluate((element: HTMLDetailsElement) => { element.open = true; });
}

async function exportSave(page: Page) {
  await campaignMenu(page);
  const downloaded = page.waitForEvent("download");
  await page.locator("#export-save").click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function importSave(page: Page, content: string) {
  await page.locator("#save-file").setInputFiles({
    name: "campaign.json", mimeType: "application/json", buffer: Buffer.from(content),
  });
}

async function confirmImport(page: Page, content: string, accept = true) {
  const dialog = page.waitForEvent("dialog");
  const selecting = importSave(page, content);
  const confirmation = await dialog;
  if (accept) await confirmation.accept();
  else await confirmation.dismiss();
  await selecting;
}

test("committed economy and day state autosave, reload exactly and continue deterministically", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.locator("#open-wholesale").click();
  await page.getByRole("button", { name: "Buy 1 Waybread", exact: true }).click();
  await page.locator("#close-wholesale").click();
  await page.evaluate(async () => {
    const path = "/Dungeon-Shop-Master/tests/scene.ts";
    (await import(path)).aimAtShelfSlot();
  });
  await page.locator("#renderCanvas").click();
  await page.mouse.up();
  await page.evaluate(() => document.exitPointerLock());
  await page.locator("#confirm-day").evaluate(() => {
    for (let day = 2; day <= 12; day += 1) {
      document.querySelector<HTMLButtonElement>("#end-day")!.click();
      document.querySelector<HTMLButtonElement>("#confirm-day")!.click();
    }
  });
  await expect(page.locator("#save-status")).toHaveText("Saved Day 12.");
  const saved = await exportSave(page);
  expect(saved.payload.shopEconomy.dailySales.day).toBe(12);
  expect(saved.payload.events.some((event: { type: string }) => event.type === "sale")).toBe(true);
  const expectedNext = await page.evaluate(async (state) => {
    const path = "/Dungeon-Shop-Master/src/game/gameState.ts";
    return (await import(path)).advanceDay(state).state;
  }, saved.payload);
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 12.");
  expect((await exportSave(page)).payload).toEqual(saved.payload);
  const visitorIds = await page.evaluate(async () => {
    const path = "/Dungeon-Shop-Master/tests/scene.ts";
    return (await import(path)).inspectNpcVisuals().visitors.map((hero: { id: string }) => hero.id).sort();
  });
  expect(visitorIds).toEqual(saved.payload.adventurers
    .filter((hero: { status: string }) => hero.status === "at-shop")
    .map((hero: { id: string }) => hero.id).sort());
  // Invalid/no-op clicks and cosmetic frames must not enqueue saves.
  await page.locator("#confirm-day").evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForTimeout(400);
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 12.");
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 13.");
  expect((await exportSave(page)).payload).toEqual(expectedNext);
  expect(errors).toEqual([]);
});

test("imports validate before confirmation; new game and overwrite require confirmation", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const initial = (await exportSave(page)).payload;
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  const saved = await exportSave(page);
  for (const content of [
    "{broken",
    JSON.stringify({ ...saved, schemaVersion: 999 }),
    JSON.stringify({ ...saved, payload: { ...saved.payload, rngState: -1 } }),
  ]) {
    await importSave(page, content);
    await expect(page.locator("#save-status")).toContainText("Import rejected:");
    await expect(page.locator("#day")).toHaveText("Day 2");
    expect((await exportSave(page)).payload).toEqual(saved.payload);
  }
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#new-game").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#new-game").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await expect(page.locator("#adventurer-roster li")).toHaveCount(10);
  await expect(page.locator("#shop-visitors")).toContainText("Shop visitors (3)");
  expect((await exportSave(page)).payload).toEqual(initial);
  await confirmImport(page, JSON.stringify(saved), false);
  await expect(page.locator("#day")).toHaveText("Day 1");
  await confirmImport(page, JSON.stringify(saved));
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  expect((await exportSave(page)).payload).toEqual(saved.payload);
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 2.");
});

test("storage denial remains playable and exportable without destroying data", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Storage denied", "SecurityError"); } });
  });
  await page.goto("./");
  await expect(page.locator("#save-status")).toContainText("Save error:");
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect((await exportSave(page)).payload.day).toBe(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#new-game").click();
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#save-status")).toContainText("Save error:");
});

test("220-day campaigns retain history with bounded HUD and survive reload", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const content = await page.evaluate(async () => {
    const statePath = "/Dungeon-Shop-Master/src/game/gameState.ts";
    const savePath = "/Dungeon-Shop-Master/src/game/campaignSave.ts";
    const { createGameState, advanceDay } = await import(statePath);
    const { createSave } = await import(savePath);
    let state = createGameState();
    for (let index = 0; index < 220; index += 1) state = advanceDay(state).state;
    return JSON.stringify(createSave(state));
  });
  await confirmImport(page, content);
  await expect(page.locator("#save-status")).toHaveText("Saved Day 221.");
  expect(await page.locator("#day-history li").count()).toBeLessThanOrEqual(100);
  expect(await page.locator("#adventurer-roster li").count()).toBeLessThanOrEqual(20);
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 221.");
  expect((await exportSave(page)).payload).toEqual(JSON.parse(content).payload);
});

test("corrupt latest stays untouched until explicit backup recovery", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 2.");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("dungeon-shop-master-campaign", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("saves", "readwrite");
        const store = transaction.objectStore("saves");
        const get = store.get("campaign");
        get.onsuccess = () => store.put({ ...get.result, latest: "{corrupt" }, "campaign");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText("Save error:");
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await page.reload();
  // Fresh in-memory play must not overwrite the corrupt record or its backup.
  await expect(page.locator("#save-status")).toContainText("Save error:");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await campaignMenu(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#recover-save").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 1.");
});

test("quota failures preserve memory and later writes recover without a stale snapshot", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = original;
      throw new DOMException(`Quota exceeded for ${args[1]}`, "QuotaExceededError");
    };
  });
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#save-status")).toContainText("Save error:");
  expect((await exportSave(page)).payload.day).toBe(2);
  await page.locator("#end-day").click();
  await page.locator("#confirm-day").click();
  await expect(page.locator("#save-status")).toHaveText("Saved Day 3.");
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Continued saved Day 3.");
});
