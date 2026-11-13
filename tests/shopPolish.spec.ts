import { expect, test } from "@playwright/test";
import { advanceTestDay } from "./advanceTestDay";

test("shop fixtures hug the walls, walk is faster and Shift temporarily sprints", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const inspect=()=>page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectShopPolish());
  const before=await inspect();
  expect(before.shelves).toEqual([-7,7]);
  expect(before.torchFlames.every(s=>s.light&&s.flame&&s.bracket)).toBe(true);
  expect(before.torchFlames.filter(s=>Math.abs(s.x??0)>6)).toHaveLength(2);
  expect(before.speed).toBe(0.28);
  await page.keyboard.down("Shift");
  await expect.poll(async()=>(await inspect()).speed).toBe(0.52);
  await page.keyboard.up("Shift");
  await expect.poll(async()=>(await inspect()).speed).toBe(0.28);
  // Holding either Shift must keep sprint active until both are released.
  await page.evaluate(()=>{
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"ShiftLeft",bubbles:true}));
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"ShiftRight",bubbles:true}));
    window.dispatchEvent(new KeyboardEvent("keyup",{code:"ShiftLeft",bubbles:true}));
  });
  await expect.poll(async()=>(await inspect()).speed).toBe(0.52);
  await page.evaluate(()=>window.dispatchEvent(
    new KeyboardEvent("keyup",{code:"ShiftRight",bubbles:true})));
  await expect.poll(async()=>(await inspect()).speed).toBe(0.28);
  expect(errors).toEqual([]);
});

test("bulk wholesale purchases, always-readable roster and bed-based day advance",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.locator("#open-wholesale").click();
  await expect(page.locator("#wholesale")).toBeVisible();
  const bread=page.locator('.catalog-row').filter({hasText:"Waybread"});
  await bread.getByRole("button",{name:"Buy 5"}).click();
  await expect(page.locator("#merchant-gold")).toHaveText("Merchant gold: 10g");
  await expect(page.locator("#wholesale-message")).toContainText("Bought 5 Waybread");
  await bread.getByRole("button",{name:"Buy max"}).click();
  await expect(page.locator("#merchant-gold")).toHaveText("Merchant gold: 0g");
  await expect(page.locator("#wholesale-message")).toContainText("Bought 5 Waybread");
  await bread.getByRole("button",{name:"Buy max"}).click();
  await expect(page.locator("#wholesale-message")).toContainText("Your inventory is full.");
  await page.locator("#close-wholesale").click();
  await page.locator("#open-roster").click();
  const first=page.locator('.roster-card[data-hero-id="adventurer-1"]');
  await expect(first.locator("summary")).toContainText("Gold");
  await expect(first.locator("summary")).toContainText("bread");
  await expect(first.locator("summary")).toContainText("herbs");
  await expect(first.locator("summary")).toContainText("No weapon");
  await expect(first.locator("summary")).toContainText("XP");
  // Mouse-hover intentionally highlights dimmed cards. Check the resting state.
  await page.mouse.move(2,2);
  await expect(page.locator('.roster-card[data-status="exploring"]').first()).toHaveCSS("opacity","0.62");
  await page.locator("#close-roster").click();
  await page.keyboard.press("n");
  await page.keyboard.press("z");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await advanceTestDay(page);
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

test("hotbar shortcuts respect modifiers and keyboard activation keeps focus", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const selected = page.locator(".inventory-row[aria-pressed=true]");
  const initialItemId = await selected.getAttribute("data-item-id");
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      code: "Digit2", ctrlKey: true, bubbles: true, cancelable: true,
    }));
    window.addEventListener("keydown", event => event.preventDefault(), { once: true, capture: true });
    document.dispatchEvent(new KeyboardEvent("keydown", {
      code: "Digit3", bubbles: true, cancelable: true,
    }));
  });
  await expect(selected).toHaveAttribute("data-item-id", initialItemId!);

  const slot = page.locator(".inventory-row").nth(1);
  const itemId = await slot.getAttribute("data-item-id");
  await slot.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".inventory-row[aria-pressed=true]")).toHaveAttribute("data-item-id", itemId!);
  await expect.poll(() => page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.dataset.itemId,
  )).toBe(itemId);
});

test("mobile sales banner, hotbar and controls occupy separate vertical space", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const bounds = await page.evaluate(() =>
    ["#sales-banner", "#inventory", ".controls"].map(selector => {
      const { top, bottom } = document.querySelector(selector)!.getBoundingClientRect();
      return { top, bottom };
    }),
  );
  expect(bounds[0].bottom).toBeLessThanOrEqual(bounds[1].top);
  expect(bounds[1].bottom).toBeLessThanOrEqual(bounds[2].top);
});
