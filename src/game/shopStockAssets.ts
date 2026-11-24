import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import { SHELF_GOODS, type ItemId } from "./economy.ts";

/**
 * The checked-in GLBs are the ONLY stock geometry source.
 * Load each file once, merge its original vertex-painted parts into one
 * reusable mesh, then share its vertex buffers with every shelf copy.
 * No inventory, furniture footprint or customer interaction belongs here.
 */
const templatesByScene = new WeakMap<Scene, Promise<ReadonlyMap<ItemId, Mesh>>>();
const materialByScene = new WeakMap<Scene, StandardMaterial>();

function vertexPaintMaterial(scene: Scene): StandardMaterial {
  let material = materialByScene.get(scene);
  if (!material) {
    material = new StandardMaterial("shop-stock-glb-vertex-paint", scene);
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(.12, .11, .09);
    materialByScene.set(scene, material);
  }
  return material;
}

async function loadTemplate(scene: Scene, itemId: ItemId): Promise<Mesh> {
  // Vite's base path is required for GitHub Pages: /Dungeon-Shop-Master/.
  const sourceUrl = `${import.meta.env.BASE_URL}assets/models/${itemId}.glb`;
  const container = await loadAssetContainerAsync(sourceUrl, scene);
  try {
    const parts = container.meshes.filter(
      (mesh): mesh is Mesh => mesh instanceof Mesh &&
        mesh.getTotalVertices() > 0 && mesh.getTotalIndices() > 0,
    );
    if (!parts.length) throw new Error("GLB has no renderable geometry: " + sourceUrl);

    // A GLB may contain many individually colored parts. Merge the original
    // glTF geometry once to keep one draw call per stocked unit, not one per
    // leaf, sword fitting or potion component.
    const template = Mesh.MergeMeshes(parts, false, true, undefined, false, false);
    if (!template) throw new Error("Cannot merge GLB stock meshes: " + sourceUrl);
    if (!template.isVerticesDataPresent(VertexBuffer.ColorKind)) {
      template.dispose();
      throw new Error("GLB stock lost its original vertex colors: " + sourceUrl);
    }
    template.name = "shop-stock-template-" + itemId;
    template.material = vertexPaintMaterial(scene);
    template.metadata = { kind: "shop-stock-template", itemId, sourceUrl };
    template.isPickable = false;
    template.checkCollisions = false;
    template.isVisible = false; // Keep the shared source itself offscreen.
    return template;
  } finally {
    // Merged vertex buffers are independent of the original glTF container.
    container.dispose();
  }
}

export function getShopStockTemplates(
  scene: Scene,
): Promise<ReadonlyMap<ItemId, Mesh>> {
  let cached = templatesByScene.get(scene);
  if (!cached) {
    cached=Promise.all(SHELF_GOODS.map(async item=>
      [item.id,await loadTemplate(scene,item.id)] as const))
      .then(entries=>new Map<ItemId,Mesh>(entries));
    templatesByScene.set(scene, cached);
  }
  return cached;
}

/** Each display unit shares the imported geometry; the shelf pad owns picks. */
export function cloneShopStockModel(template: Mesh, name: string): Mesh {
  const copy = template.clone(name, null, true);
  if (!copy) throw new Error("Cannot clone GLB stock mesh: " + template.name);
  copy.metadata = { ...template.metadata };
  copy.isVisible = true;
  copy.isPickable = false;
  copy.checkCollisions = false;
  return copy;
}
