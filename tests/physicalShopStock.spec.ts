import { expect, test } from "@playwright/test";

test("the six physical shop goods are 3D meshes, not pickable shelf blockers", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("./");
  const models = await page.evaluate(async () => {
    const testScene = await import("/Dungeon-Shop-Master/tests/scene.ts");
    return testScene.inspectPhysicalStockMeshes();
  });
  expect(models.map(model => model.itemId)).toEqual([
    "healing-herb", "mana-potion", "iron-ore",
    "bread", "iron-sword", "leather-vest",
  ]);
  for (const model of models) {
    expect(model.vertices, model.itemId).toBeGreaterThan(20);
    expect(model.triangles, model.itemId).toBeGreaterThan(10);
    expect(model.hasVertexPaint, model.itemId).toBe(true);
    expect(model.pickable, model.itemId).toBe(false);
    expect(model.collisions, model.itemId).toBe(false);
    expect(model.size.every(value => value > 0), model.itemId).toBe(true);
  }
  expect(pageErrors).toEqual([]);
});
