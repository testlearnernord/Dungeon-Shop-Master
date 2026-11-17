import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";

/**
 * The original anatomical GLB supplies actual authored surfaces; Babylon's
 * existing runtime rig supplies animation. Grafting vertex buffers onto the
 * established rig meshes keeps hit geometry, IK, scene disposal, names and
 * replay semantics identical. It is NOT a skinned-GLB animation controller.
 */
export const CAVE_TROLL_SCULPT_PARTS = [
  "barrel-torso", "bent-upper-back", "belly", "neck", "head", "nose",
  "upper-arm--1", "upper-arm-1", "forearm--1", "forearm-1",
  "thigh--1", "thigh-1", "shin--1", "shin-1",
  "boulder-foot--1", "boulder-foot-1", "maul-stone-core",
] as const;

export async function applyCaveTrollSculpt(
  scene: Scene, targets: readonly Mesh[],
): Promise<string> {
  const sourceUrl = `${import.meta.env.BASE_URL}assets/models/ashen-mauler-sculpt.glb`;
  const container = await loadAssetContainerAsync(sourceUrl, scene);
  try {
    const sources = CAVE_TROLL_SCULPT_PARTS.map(part => {
      const name = "sculpt-" + part;
      const mesh = container.meshes.find(m => m.name === name);
      if (!(mesh instanceof Mesh) || mesh.getTotalVertices() < 120 ||
          mesh.getTotalIndices() < 250)
        throw new Error("Missing authored GLB surface: " + name);
      return mesh;
    });
    // Resolve every target before changing a single piece of the live model.
    const grafts = CAVE_TROLL_SCULPT_PARTS.map((part, index) => {
      const target = targets.find(mesh => mesh.name === "troll-" + part);
      if (!target || target.isDisposed()) throw new Error("Missing rig mesh: " + part);
      const vertices = VertexData.ExtractFromMesh(sources[index]!, true, true);
      if (!vertices.positions?.length || !vertices.indices?.length ||
          !vertices.normals?.length || !vertices.uvs?.length ||
          !vertices.colors?.length)
        throw new Error("Invalid sculpt topology or paint: " + part);
      return { target, vertices };
    });
    for (const { target, vertices } of grafts) {
      if (target.isDisposed()) return sourceUrl; // closed/restarted while loading
      vertices.applyToMesh(target, true);
      target.metadata = { ...target.metadata, sculpted: true, sourceUrl };
    }
    return sourceUrl;
  } finally {
    // Imported geometry is copied into existing rig meshes, not used as a
    // second renderable model. No duplicate troll or hidden collision actors.
    container.dispose();
  }
}
